/**
 * @module api/lists
 * @description Routes API pour la gestion des listes (films, livres, restaurants, notes).
 * GET  : récupère tous les items, avec filtrage optionnel par catégorie
 * POST : crée un nouvel item manuel dans une catégorie
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { TITLE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '@/lib/config';
import type { ListItem, ListItemImage } from '@/lib/types';

/**
 * Vérifie qu'une clé de catégorie existe dans la table list_categories.
 * @param category - Clé à valider
 * @returns true si la catégorie existe
 */
function isCategoryValid(category: string): boolean {
  const row = db.prepare('SELECT id FROM list_categories WHERE category = ?').get(category);
  return row !== undefined;
}

/**
 * Peuple les items avec leurs images associées en une seule requête groupée.
 * @param items - Items de liste à enrichir
 * @returns Items avec la propriété `images` renseignée
 */
function attachImagesToItems(items: ListItem[]): ListItem[] {
  if (items.length === 0) return items;

  const ids = items.map((i) => i.id);
  const placeholders = ids.map(() => '?').join(', ');
  const images = db
    .prepare(`SELECT * FROM list_item_images WHERE list_item_id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...ids) as ListItemImage[];

  // Regroupe les images par item
  const imagesByItem = new Map<number, ListItemImage[]>();
  for (const img of images) {
    const existing = imagesByItem.get(img.list_item_id) ?? [];
    existing.push(img);
    imagesByItem.set(img.list_item_id, existing);
  }

  return items.map((item) => ({ ...item, images: imagesByItem.get(item.id) ?? [] }));
}

/**
 * Récupère tous les items de listes, avec possibilité de filtrer par catégorie.
 * @param request - Requête avec query param optionnel ?category=
 * @returns Liste des items en JSON
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let items: ListItem[];

    if (category) {
      if (!isCategoryValid(category)) {
        return NextResponse.json({ error: 'Catégorie invalide' }, { status: 400 });
      }
      items = db
        .prepare('SELECT * FROM list_items WHERE category = ? ORDER BY position ASC, id ASC')
        .all(category) as ListItem[];
    } else {
      items = db
        .prepare('SELECT * FROM list_items ORDER BY position ASC, id ASC')
        .all() as ListItem[];
    }

    const enrichedItems = attachImagesToItems(items);

    logger.info('api/lists', `GET  -  ${items.length} items récupérés (catégorie: ${category ?? 'toutes'})`);
    return NextResponse.json(enrichedItems);
  } catch (error) {
    logger.error('api/lists', `GET  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des items' }, { status: 500 });
  }
}

/**
 * Crée un nouvel item dans une liste.
 * @param request - Requête contenant { category, title, description?, extra_data? }
 * @returns L'item créé en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as {
      category?: string;
      title?: string;
      description?: string;
      extra_data?: string;
    };

    // Validation des champs obligatoires
    if (!body.category || !isCategoryValid(body.category)) {
      return NextResponse.json({ error: 'Catégorie invalide ou manquante' }, { status: 400 });
    }

    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      return NextResponse.json({ error: 'Le titre est obligatoire' }, { status: 400 });
    }

    if (body.title.trim().length > TITLE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Le titre ne peut pas depasser ${TITLE_MAX_LENGTH} caracteres` },
        { status: 400 }
      );
    }

    if (body.description && typeof body.description === 'string' && body.description.length > DESCRIPTION_MAX_LENGTH) {
      return NextResponse.json(
        { error: `La description ne peut pas depasser ${DESCRIPTION_MAX_LENGTH} caracteres` },
        { status: 400 }
      );
    }

    const stmt = db.prepare(`
      INSERT INTO list_items (category, title, description, extra_data, source)
      VALUES (@category, @title, @description, @extra_data, 'manual')
    `);

    const result = stmt.run({
      category: body.category,
      title: body.title.trim(),
      description: body.description?.trim() ?? null,
      extra_data: body.extra_data ?? null,
    });

    const item = db
      .prepare('SELECT * FROM list_items WHERE id = ?')
      .get(result.lastInsertRowid) as ListItem;

    logger.info('api/lists', `POST  -  Item créé : id=${item.id}, catégorie="${item.category}", titre="${item.title}"`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    logger.error('api/lists', `POST  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la création de l\'item' }, { status: 500 });
  }
}
