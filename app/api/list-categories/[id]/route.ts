/**
 * @module api/list-categories/[id]
 * @description Routes API pour la gestion individuelle d'une catégorie de liste.
 * PATCH  : met à jour le nom et/ou l'icône d'une catégorie
 * DELETE : supprime une catégorie (interdit si des items actifs lui appartiennent)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ListCategory } from '@/lib/types';

/** Corps attendu pour la mise à jour d'une catégorie */
interface CategoryPatchBody {
  name?: string;
  icon?: string;
}

/**
 * Met à jour le nom et/ou l'icône d'une catégorie de liste.
 * La clé category et le tag ne sont pas modifiables après création.
 * @param request - Requête contenant { name?, icon? }
 * @param params - Paramètres de route contenant l'id de la catégorie
 * @returns La catégorie mise à jour en JSON
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM list_categories WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 });
    }

    const body = await request.json() as CategoryPatchBody;

    const updates: string[] = [];
    const values: Record<string, unknown> = {};

    if ('name' in body) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'Le nom ne peut pas être vide' }, { status: 400 });
      }
      updates.push('name = @name');
      values['name'] = body.name.trim();
    }

    if ('icon' in body) {
      updates.push('icon = @icon');
      values['icon'] = body.icon?.trim() || '📋';
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 });
    }

    values['id'] = id;
    db.prepare(`UPDATE list_categories SET ${updates.join(', ')} WHERE id = @id`).run(values);

    const updated = db.prepare('SELECT * FROM list_categories WHERE id = ?').get(id) as ListCategory;

    logger.info('api/list-categories', `PATCH  -  Catégorie mise à jour : id=${id}`);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('api/list-categories', `PATCH  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de la catégorie' }, { status: 500 });
  }
}

/**
 * Supprime une catégorie de liste.
 * Refusé si des items non archivés appartiennent encore à cette catégorie.
 * @param _request - Requête HTTP (non utilisée)
 * @param params - Paramètres de route contenant l'id de la catégorie
 * @returns Confirmation de suppression
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const cat = db
      .prepare('SELECT id, category, name FROM list_categories WHERE id = ?')
      .get(id) as { id: number; category: string; name: string } | undefined;

    if (!cat) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 404 });
    }

    // Refuse la suppression si des items actifs (non archivés) appartiennent à cette catégorie
    const activeCount = (
      db.prepare('SELECT COUNT(*) as n FROM list_items WHERE category = ? AND archived = 0').get(cat.category) as { n: number }
    ).n;

    if (activeCount > 0) {
      return NextResponse.json(
        { error: `Impossible de supprimer : ${activeCount} item(s) actif(s) dans cette liste` },
        { status: 409 }
      );
    }

    db.prepare('DELETE FROM list_categories WHERE id = ?').run(id);

    logger.info('api/list-categories', `DELETE  -  Catégorie supprimée : "${cat.category}" (id=${id})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/list-categories', `DELETE  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de la catégorie' }, { status: 500 });
  }
}
