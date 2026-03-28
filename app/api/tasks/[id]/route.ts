/**
 * @module api/tasks/[id]
 * @description Routes API pour la gestion individuelle d'une tâche par son identifiant.
 * PATCH  : met à jour les champs autorisés d'une tâche, applique les règles métier
 *          sur les slots tomorrow, et retourne { task, tomorrowSlot, deletedTomorrowSlotId }.
 * DELETE : supprime une tâche et ses pièces jointes (CASCADE SQLite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Task } from '@/lib/types';

/** Champs modifiables d'une tâche via PATCH */
interface TaskPatchBody {
  title?: string;
  description?: string | null;
  status?: string;
  board?: string;
  slot_type?: string | null;
  position?: number | null;
}

/**
 * Met à jour les champs spécifiés d'une tâche existante et applique les règles
 * métier sur les slots verrouillés dans le board tomorrow.
 *
 * Règles appliquées après la mise à jour :
 *  - Règle A : status='waiting' sans board explicite → force board='waiting'
 *  - Règle B : board passe de 'today' à 'waiting' → supprime le slot locked tomorrow lié
 *  - Règle C : status passe à 'done' ET board='today' → supprime le slot locked tomorrow lié
 *  - Règle D : board passe à 'today' depuis un autre board (injection waiting→today)
 *              → crée un slot locked tomorrow si moins de 5 slots existent déjà
 *  - Règle E : status revient de 'done' vers autre chose ET board='today' (restauration)
 *              → crée un slot locked tomorrow si moins de 5 slots existent déjà
 *
 * @param request - Requête contenant les champs à modifier
 * @param params - Paramètres de route contenant l'id de la tâche
 * @returns { task, tomorrowSlot, deletedTomorrowSlotId }
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

    // Charge la tâche complète avant modification pour comparer les états avant/après
    const currentTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
    if (!currentTask) {
      return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 });
    }

    const body = await request.json() as TaskPatchBody;

    // Règle A : si status='waiting' est demandé sans board explicite,
    // force board='waiting' pour que la tâche quitte today visuellement
    if (body.status === 'waiting' && !('board' in body)) {
      body.board = 'waiting';
    }

    // Champs autorisés à mettre à jour
    const allowedFields = ['title', 'description', 'status', 'board', 'slot_type', 'position'];
    const updates: string[] = [];
    const values: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        // Validation du titre : ne peut pas être vide
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

    // Cas spécial : archivage manuel depuis la file d'attente → fixe la date d'archivage
    if (body.board === 'archive') {
      updates.push('archived_at = CURRENT_TIMESTAMP');
    }

    // Mise à jour automatique du champ updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values['id'] = id;

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`).run(values);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;

    // Variables de retour pour les effets secondaires sur les slots tomorrow
    let tomorrowSlot: Task | null = null;
    let deletedTomorrowSlotId: number | null = null;

    // Règle B : la tâche bascule de today vers waiting → supprime le slot locked tomorrow lié
    if (updatedTask.board === 'waiting' && currentTask.board === 'today') {
      const slotToDelete = db
        .prepare(`SELECT id FROM tasks WHERE linked_task_id = ? AND board = 'tomorrow' AND slot_type = 'locked'`)
        .get(id) as { id: number } | undefined;

      if (slotToDelete) {
        db.prepare(`DELETE FROM tasks WHERE id = ?`).run(slotToDelete.id);
        deletedTomorrowSlotId = slotToDelete.id;
        logger.info('api/tasks', `PATCH — Slot locked tomorrow supprimé (waiting) : linked_task_id=${id}, slot_id=${slotToDelete.id}`);
      }
    }
    // Règle C : la tâche est marquée done ET reste dans today → supprime le slot locked tomorrow lié
    else if (updatedTask.status === 'done' && updatedTask.board === 'today') {
      const slotToDelete = db
        .prepare(`SELECT id FROM tasks WHERE linked_task_id = ? AND board = 'tomorrow' AND slot_type = 'locked'`)
        .get(id) as { id: number } | undefined;

      if (slotToDelete) {
        db.prepare(`DELETE FROM tasks WHERE id = ?`).run(slotToDelete.id);
        deletedTomorrowSlotId = slotToDelete.id;
        logger.info('api/tasks', `PATCH — Slot locked tomorrow supprimé (done) : linked_task_id=${id}, slot_id=${slotToDelete.id}`);
      }
    }
    // Règle D : la tâche vient d'être injectée dans today depuis un autre board (ex: waiting)
    // → crée un slot locked dans tomorrow si capacity disponible
    else if (updatedTask.board === 'today' && currentTask.board !== 'today') {
      tomorrowSlot = creerSlotLockedTomorrow(id, updatedTask.title);
    }
    // Règle E : la tâche revient de done vers un autre statut ET reste dans today (restauration)
    // → recrée le slot locked dans tomorrow
    else if (
      currentTask.status === 'done' &&
      updatedTask.status !== 'done' &&
      updatedTask.board === 'today'
    ) {
      tomorrowSlot = creerSlotLockedTomorrow(id, updatedTask.title);
    }

    logger.info('api/tasks', `PATCH — Tâche mise à jour : id=${id}`);
    return NextResponse.json({ task: updatedTask, tomorrowSlot, deletedTomorrowSlotId });
  } catch (error) {
    logger.error('api/tasks', `PATCH — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de la tâche' }, { status: 500 });
  }
}

/**
 * Crée un slot verrouillé dans le board tomorrow lié à une tâche today,
 * uniquement si le board tomorrow n'a pas encore atteint 5 slots.
 * Retourne le slot créé, ou null si la capacité est déjà atteinte ou si un slot existe déjà.
 * @param linkedTaskId - Identifiant de la tâche today source
 * @param title - Titre à copier dans le slot tomorrow
 * @returns Le slot créé, ou null
 */
function creerSlotLockedTomorrow(linkedTaskId: number, title: string): Task | null {
  // Vérifie qu'un slot locked lié n'existe pas déjà pour éviter les doublons
  const existingSlot = db
    .prepare(`SELECT id FROM tasks WHERE linked_task_id = ? AND board = 'tomorrow' AND slot_type = 'locked'`)
    .get(linkedTaskId);

  if (existingSlot) {
    return null;
  }

  // Vérifie la capacité du board tomorrow (max 5 slots)
  const count = (db
    .prepare(`SELECT COUNT(*) as total FROM tasks WHERE board = 'tomorrow'`)
    .get() as { total: number }).total;

  if (count >= 5) {
    logger.info('api/tasks', `creerSlotLockedTomorrow — Capacité tomorrow atteinte, slot non créé pour linked_task_id=${linkedTaskId}`);
    return null;
  }

  // Détermine la prochaine position disponible dans tomorrow
  const maxPos = (db
    .prepare(`SELECT COALESCE(MAX(position), 0) as maxPos FROM tasks WHERE board = 'tomorrow'`)
    .get() as { maxPos: number }).maxPos;

  const result = db.prepare(`
    INSERT INTO tasks (title, status, board, slot_type, position, source, linked_task_id)
    VALUES (@title, 'todo', 'tomorrow', 'locked', @position, 'manual', @linkedTaskId)
  `).run({ title, position: maxPos + 1, linkedTaskId });

  const slot = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid) as Task;
  logger.info('api/tasks', `creerSlotLockedTomorrow — Slot créé : id=${slot.id}, linked_task_id=${linkedTaskId}`);
  return slot;
}

/**
 * Supprime une tâche et toutes ses pièces jointes (gérées par CASCADE SQLite).
 * @param _request - Requête HTTP (non utilisée pour DELETE)
 * @param params - Paramètres de route contenant l'id de la tâche
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

    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 });
    }

    logger.info('api/tasks', `DELETE — Tâche supprimée : id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/tasks', `DELETE — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de la tâche' }, { status: 500 });
  }
}
