/**
 * @module api/tomorrow
 * @description Routes API pour la gestion des slots du tableau "demain".
 * GET  : récupère toutes les tâches du tableau tomorrow
 * POST : crée un slot libre dans tomorrow (limite : 5 slots au total)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Task } from '@/lib/types';

/**
 * Récupère toutes les tâches du tableau "tomorrow", triées par position.
 * @returns Liste des tâches de demain en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE board = 'tomorrow'
         ORDER BY position ASC, id ASC`
      )
      .all() as Task[];

    logger.info('api/tomorrow', `GET — ${tasks.length} slots récupérés`);
    return NextResponse.json(tasks);
  } catch (error) {
    logger.error('api/tomorrow', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des slots' }, { status: 500 });
  }
}

/**
 * Crée un slot libre dans le tableau "tomorrow".
 * Refuse si demain contient déjà 5 tâches au total.
 * @param request - Requête contenant { title?, description? }
 * @returns Le slot créé en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { title?: string; description?: string };

    // Vérification de la limite de 5 slots dans tomorrow
    const count = (db
      .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE board = 'tomorrow'`)
      .get() as { cnt: number }).cnt;

    if (count >= 5) {
      return NextResponse.json(
        { error: 'Le tableau "demain" contient déjà 5 slots' },
        { status: 409 }
      );
    }

    // Détermine la position suivante disponible
    const maxPos = (db
      .prepare(`SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE board = 'tomorrow'`)
      .get() as { max_pos: number }).max_pos;

    const stmt = db.prepare(`
      INSERT INTO tasks (title, description, status, board, slot_type, position, source)
      VALUES (@title, @description, 'todo', 'tomorrow', 'free', @position, 'manual')
    `);

    const result = stmt.run({
      title: body.title?.trim() ?? 'Nouveau slot',
      description: body.description?.trim() ?? null,
      position: maxPos + 1,
    });

    const task = db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(result.lastInsertRowid) as Task;

    logger.info('api/tomorrow', `POST — Slot libre créé : id=${task.id}`);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logger.error('api/tomorrow', `POST — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la création du slot' }, { status: 500 });
  }
}
