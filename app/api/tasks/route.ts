/**
 * @module api/tasks
 * @description Routes API pour la gestion des tâches des tableaux "today" et "waiting".
 * GET  : récupère les tâches today + waiting ordonnées par position
 * POST : crée une nouvelle tâche manuelle dans le tableau today (limite : 5 tâches)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { TITLE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '@/lib/config';
import type { Task } from '@/lib/types';

/**
 * Récupère toutes les tâches des tableaux "today" et "waiting", triées par position.
 * @returns Liste des tâches en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE board IN ('today', 'waiting')
         ORDER BY position ASC, id ASC`
      )
      .all() as Task[];

    logger.info('api/tasks', `GET  -  ${tasks.length} tâches récupérées`);
    return NextResponse.json(tasks);
  } catch (error) {
    logger.error('api/tasks', `GET  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des tâches' }, { status: 500 });
  }
}

/**
 * Crée une nouvelle tâche dans le tableau "today" et un slot verrouillé correspondant dans "tomorrow".
 * Le slot tomorrow est créé automatiquement car toute tâche non terminée le jour même
 * sera reportée au lendemain. Refuse si today contient déjà 5 tâches.
 * @param request - Requête contenant { title, description? }
 * @returns { task: Task, tomorrowSlot: Task | null }  -  le slot tomorrow est null si demain est plein
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { title?: string; description?: string };

    // Validation du titre obligatoire
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

    // Vérification de la limite de 5 tâches dans today
    const todayCount = (db
      .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE board = 'today'`)
      .get() as { cnt: number }).cnt;

    if (todayCount >= 5) {
      return NextResponse.json(
        { error: 'Le tableau "aujourd\'hui" contient déjà 5 tâches' },
        { status: 409 }
      );
    }

    const title = body.title.trim();
    const description = body.description?.trim() ?? null;

    // Création atomique de la tâche today + du slot locked tomorrow dans une transaction
    const { task, tomorrowSlot } = db.transaction(() => {
      // Position suivante dans today
      const maxTodayPos = (db
        .prepare(`SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE board = 'today'`)
        .get() as { max_pos: number }).max_pos;

      const todayResult = db.prepare(`
        INSERT INTO tasks (title, description, status, board, position, source)
        VALUES (@title, @description, 'todo', 'today', @position, 'manual')
      `).run({ title, description, position: maxTodayPos + 1 });

      const createdTask = db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(todayResult.lastInsertRowid) as Task;

      // Crée le slot locked dans tomorrow si la limite n'est pas atteinte
      const tomorrowCount = (db
        .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE board = 'tomorrow'`)
        .get() as { cnt: number }).cnt;

      if (tomorrowCount >= 5) {
        return { task: createdTask, tomorrowSlot: null };
      }

      const maxTomorrowPos = (db
        .prepare(`SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE board = 'tomorrow'`)
        .get() as { max_pos: number }).max_pos;

      // linked_task_id relie ce slot locked à la tâche today d'origine
      // pour pouvoir le supprimer immédiatement si la tâche est marquée terminée
      const tomorrowResult = db.prepare(`
        INSERT INTO tasks (title, description, status, board, slot_type, position, source, linked_task_id)
        VALUES (@title, @description, 'todo', 'tomorrow', 'locked', @position, 'manual', @linked_task_id)
      `).run({ title, description, position: maxTomorrowPos + 1, linked_task_id: createdTask.id });

      const createdSlot = db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(tomorrowResult.lastInsertRowid) as Task;

      return { task: createdTask, tomorrowSlot: createdSlot };
    })();

    logger.info('api/tasks', `POST  -  Tâche créée : id=${task.id}, titre="${task.title}", slot_tomorrow=${tomorrowSlot?.id ?? 'aucun'}`);
    return NextResponse.json({ task, tomorrowSlot }, { status: 201 });
  } catch (error) {
    logger.error('api/tasks', `POST  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la création de la tâche' }, { status: 500 });
  }
}
