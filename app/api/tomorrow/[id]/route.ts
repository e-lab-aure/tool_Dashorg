/**
 * @module api/tomorrow/[id]
 * @description Routes API pour la gestion individuelle d'un slot du tableau "demain".
 * PATCH  : met à jour les champs autorisés d'un slot
 * DELETE : supprime un slot libre uniquement (les slots verrouillés ne peuvent pas être supprimés)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Task } from '@/lib/types';

/** Champs modifiables d'un slot tomorrow via PATCH */
interface TomorrowPatchBody {
  title?: string;
  description?: string | null;
  slot_type?: string | null;
  position?: number | null;
}

/**
 * Met à jour les champs autorisés d'un slot du tableau tomorrow.
 * @param request - Requête contenant les champs à modifier
 * @param params - Paramètres de route contenant l'id du slot
 * @returns Le slot mis à jour en JSON
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

    const existing = db
      .prepare("SELECT id FROM tasks WHERE id = ? AND board = 'tomorrow'")
      .get(id);

    if (!existing) {
      return NextResponse.json({ error: 'Slot introuvable dans le tableau demain' }, { status: 404 });
    }

    const body = await request.json() as TomorrowPatchBody;

    const allowedFields = ['title', 'description', 'slot_type', 'position'];
    const updates: string[] = [];
    const values: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = @${field}`);
        values[field] = (body as Record<string, unknown>)[field];
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values['id'] = id;

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`).run(values);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;

    logger.info('api/tomorrow', `PATCH — Slot mis à jour : id=${id}`);
    return NextResponse.json(task);
  } catch (error) {
    logger.error('api/tomorrow', `PATCH — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour du slot' }, { status: 500 });
  }
}

/**
 * Supprime un slot libre du tableau tomorrow.
 * Interdit de supprimer un slot de type "locked" — ces slots sont gérés par le rollover automatique.
 * @param _request - Requête HTTP (non utilisée pour DELETE)
 * @param params - Paramètres de route contenant l'id du slot
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

    // Récupère le slot pour vérifier son type
    const slot = db
      .prepare("SELECT id, slot_type FROM tasks WHERE id = ? AND board = 'tomorrow'")
      .get(id) as { id: number; slot_type: string } | undefined;

    if (!slot) {
      return NextResponse.json({ error: 'Slot introuvable dans le tableau demain' }, { status: 404 });
    }

    // Les slots verrouillés ne peuvent pas être supprimés manuellement
    if (slot.slot_type === 'locked') {
      return NextResponse.json(
        { error: 'Impossible de supprimer un slot verrouillé' },
        { status: 403 }
      );
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    logger.info('api/tomorrow', `DELETE — Slot libre supprimé : id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/tomorrow', `DELETE — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression du slot' }, { status: 500 });
  }
}
