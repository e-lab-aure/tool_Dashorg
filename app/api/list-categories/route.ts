/**
 * @module api/list-categories
 * @description Routes API pour la gestion des catégories de listes.
 * GET  : retourne toutes les catégories triées par position
 * POST : crée une nouvelle catégorie (tag + nom + icône)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ListCategory } from '@/lib/types';

/**
 * Retourne toutes les catégories de listes triées par position.
 * @returns Tableau de ListCategory en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const categories = db
      .prepare('SELECT * FROM list_categories ORDER BY position ASC, created_at ASC')
      .all() as ListCategory[];

    logger.info('api/list-categories', `GET  -  ${categories.length} catégorie(s) récupérée(s)`);
    return NextResponse.json(categories);
  } catch (error) {
    logger.error('api/list-categories', `GET  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des catégories' }, { status: 500 });
  }
}

/** Corps attendu pour la création d'une catégorie */
interface CategoryPostBody {
  name?: string;
  category?: string;
  tag?: string;
  icon?: string;
}

/**
 * Crée une nouvelle catégorie de liste.
 * Le tag est normalisé en majuscules et encadré de crochets si absent.
 * La clé category est normalisée en minuscules alphanumériques.
 * @param request - Requête contenant { name, category, tag, icon? }
 * @returns La catégorie créée en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as CategoryPostBody;

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 });
    }

    if (!body.category || typeof body.category !== 'string' || body.category.trim() === '') {
      return NextResponse.json({ error: 'La clé de catégorie est obligatoire' }, { status: 400 });
    }

    // Normalisation de la clé : minuscules, alphanumérique et underscore uniquement
    const normalizedCategory = body.category
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!normalizedCategory) {
      return NextResponse.json({ error: 'Clé de catégorie invalide' }, { status: 400 });
    }

    // Normalisation du tag : majuscules et encadré de crochets
    const rawTag = (body.tag ?? body.category).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const normalizedTag = rawTag.startsWith('[') ? rawTag : `[${rawTag}]`;

    const icon = body.icon?.trim() || '📋';

    // Vérification de l'unicité de la clé et du tag
    const existingCategory = db
      .prepare('SELECT id FROM list_categories WHERE category = ?')
      .get(normalizedCategory);

    if (existingCategory) {
      return NextResponse.json({ error: 'Cette clé de catégorie existe déjà' }, { status: 409 });
    }

    const existingTag = db
      .prepare('SELECT id FROM list_categories WHERE tag = ?')
      .get(normalizedTag);

    if (existingTag) {
      return NextResponse.json({ error: 'Ce tag est déjà utilisé par une autre liste' }, { status: 409 });
    }

    // Détermine la prochaine position
    const maxPos = (
      db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM list_categories').get() as { maxPos: number }
    ).maxPos;

    const result = db.prepare(`
      INSERT INTO list_categories (category, name, tag, icon, position)
      VALUES (@category, @name, @tag, @icon, @position)
    `).run({
      category: normalizedCategory,
      name: body.name.trim(),
      tag: normalizedTag,
      icon,
      position: maxPos + 1,
    });

    const created = db
      .prepare('SELECT * FROM list_categories WHERE id = ?')
      .get(result.lastInsertRowid) as ListCategory;

    logger.info('api/list-categories', `POST  -  Catégorie créée : "${normalizedCategory}" (tag: ${normalizedTag})`);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error('api/list-categories', `POST  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la création de la catégorie' }, { status: 500 });
  }
}
