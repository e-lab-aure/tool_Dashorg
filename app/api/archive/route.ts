/**
 * @module api/archive
 * @description Routes API pour la gestion des tâches archivées.
 * Les tâches terminées sont archivées automatiquement lors du rollover de 6h00.
 * GET  : récupère les tâches archivées, triées par date d'archivage décroissante
 * POST : restaure une tâche archivée en file d'attente (board = 'waiting')
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Task } from '@/lib/types';

/**
 * Récupère toutes les tâches archivées, les plus récentes en premier.
 * @returns Liste des tâches archivées en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE board = 'archive'
         ORDER BY archived_at DESC, id DESC`
      )
      .all() as Task[];

    logger.info('api/archive', `GET — ${tasks.length} tâche(s) archivée(s) récupérées`);
    return NextResponse.json(tasks);
  } catch (error) {
    logger.error('api/archive', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des archives' }, { status: 500 });
  }
}

/**
 * Restaure une tâche archivée en la remettant dans la file d'attente.
 * @param request - Requête contenant { task_id: number }
 * @returns La tâche restaurée en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { task_id?: number };

    if (!body.task_id || typeof body.task_id !== 'number') {
      return NextResponse.json({ error: 'task_id obligatoire' }, { status: 400 });
    }

    const existing = db
      .prepare(`SELECT id FROM tasks WHERE id = ? AND board = 'archive'`)
      .get(body.task_id);

    if (!existing) {
      return NextResponse.json({ error: 'Tâche archivée introuvable' }, { status: 404 });
    }

    // Remet la tâche en file d'attente avec le statut "waiting"
    db.prepare(`
      UPDATE tasks
      SET board = 'waiting', status = 'waiting', archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(body.task_id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(body.task_id) as Task;

    logger.info('api/archive', `POST — Tâche id=${body.task_id} restaurée en file d'attente`);
    return NextResponse.json(task);
  } catch (error) {
    logger.error('api/archive', `POST — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la restauration de la tâche' }, { status: 500 });
  }
}
