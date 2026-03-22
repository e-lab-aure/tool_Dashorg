/**
 * @module api/lists/reorder
 * @description Route API pour réordonner les items d'une liste.
 * POST : reçoit un tableau d'IDs dans le nouvel ordre et met à jour les positions
 *        en une seule transaction. Retourne les items mis à jour avec leurs nouvelles positions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ListItem, ListItemImage } from '@/lib/types';

/**
 * Réordonne les items en mettant à jour leur champ position selon l'ordre reçu.
 * Toutes les mises à jour sont effectuées dans une transaction atomique.
 * @param request - Requête contenant { ids: number[] } dans le nouvel ordre souhaité
 * @returns Les items réordonnés avec leurs nouvelles positions et images associées
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { ids?: unknown };

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: 'Le tableau d\'ids est obligatoire' }, { status: 400 });
    }

    // Valide que tous les éléments sont bien des entiers positifs
    const ids: number[] = [];
    for (const raw of body.ids) {
      const n = parseInt(String(raw), 10);
      if (isNaN(n) || n <= 0) {
        return NextResponse.json({ error: 'Identifiants invalides dans le tableau' }, { status: 400 });
      }
      ids.push(n);
    }

    // Met à jour toutes les positions en une transaction pour garantir la cohérence
    const updateStmt = db.prepare('UPDATE list_items SET position = @position WHERE id = @id');

    const applyReorder = db.transaction(() => {
      for (let i = 0; i < ids.length; i++) {
        updateStmt.run({ position: i, id: ids[i] });
      }
    });

    applyReorder();

    // Récupère les items réordonnés avec leurs images associées
    const placeholders = ids.map(() => '?').join(', ');
    const items = db
      .prepare(`SELECT * FROM list_items WHERE id IN (${placeholders}) ORDER BY position ASC, id ASC`)
      .all(...ids) as ListItem[];

    // Enrichit les items avec leurs images
    const images = db
      .prepare(`SELECT * FROM list_item_images WHERE list_item_id IN (${placeholders}) ORDER BY created_at ASC`)
      .all(...ids) as ListItemImage[];

    const imagesByItem = new Map<number, ListItemImage[]>();
    for (const img of images) {
      const existing = imagesByItem.get(img.list_item_id) ?? [];
      existing.push(img);
      imagesByItem.set(img.list_item_id, existing);
    }

    const enriched = items.map((item) => ({ ...item, images: imagesByItem.get(item.id) ?? [] }));

    logger.info('api/lists/reorder', `POST — ${ids.length} item(s) réordonnés`);
    return NextResponse.json(enriched);
  } catch (error) {
    logger.error('api/lists/reorder', `POST — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors du réordonnancement' }, { status: 500 });
  }
}
