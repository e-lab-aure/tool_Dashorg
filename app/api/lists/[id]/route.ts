/**
 * @module api/lists/[id]
 * @description Routes API pour la gestion individuelle d'un item de liste par son identifiant.
 * PATCH  : met à jour les champs autorisés d'un item
 * DELETE : supprime un item de liste
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ListItem } from '@/lib/types';

/** Champs modifiables d'un item via PATCH */
interface ListItemPatchBody {
  title?: string;
  description?: string | null;
  extra_data?: string | null;
  done?: number;
  archived?: number;
}

/**
 * Met à jour les champs autorisés d'un item de liste.
 * @param request - Requête contenant les champs à modifier
 * @param params - Paramètres de route contenant l'id de l'item
 * @returns L'item mis à jour en JSON
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

    const existing = db.prepare('SELECT id FROM list_items WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Item introuvable' }, { status: 404 });
    }

    const body = await request.json() as ListItemPatchBody;

    const allowedFields = ['title', 'description', 'extra_data', 'done', 'archived'];
    const updates: string[] = [];
    const values: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'title' && (typeof body.title !== 'string' || body.title.trim() === '')) {
          return NextResponse.json({ error: 'Le titre ne peut pas être vide' }, { status: 400 });
        }
        updates.push(`${field} = @${field}`);
        values[field] = field === 'title' ? (body.title as string).trim() : (body as Record<string, unknown>)[field];
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 });
    }

    values['id'] = id;
    db.prepare(`UPDATE list_items SET ${updates.join(', ')} WHERE id = @id`).run(values);

    const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(id) as ListItem;

    logger.info('api/lists', `PATCH  -  Item mis à jour : id=${id}`);
    return NextResponse.json(item);
  } catch (error) {
    logger.error('api/lists', `PATCH  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de l\'item' }, { status: 500 });
  }
}

/**
 * Supprime un item de liste.
 * @param _request - Requête HTTP (non utilisée pour DELETE)
 * @param params - Paramètres de route contenant l'id de l'item
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

    const result = db.prepare('DELETE FROM list_items WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Item introuvable' }, { status: 404 });
    }

    logger.info('api/lists', `DELETE  -  Item supprimé : id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/lists', `DELETE  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de l\'item' }, { status: 500 });
  }
}
