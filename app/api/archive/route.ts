/**
 * @module api/archive
 * @description Routes API pour la gestion des taches archivees.
 * Les taches terminees sont archivees automatiquement lors du rollover de 6h00.
 * GET  : recupere les taches archivees avec pagination (?limit=50&offset=0)
 * POST : restaure une tache archivee en file d'attente (board = 'waiting')
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Task } from '@/lib/types';

/** Nombre de taches archivees retournees par page par defaut */
const DEFAULT_LIMIT = 50;

/** Nombre maximum de taches archivees retournables en une seule requete */
const MAX_LIMIT = 200;

/**
 * Recupere les taches archivees avec pagination, les plus recentes en premier.
 * @param request - Requete avec query params optionnels ?limit=N&offset=N
 * @returns Objet JSON avec la liste des taches et le total disponible
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parsing et clamp des parametres de pagination
    const limitParam = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
    const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);

    const limit = isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : Math.min(limitParam, MAX_LIMIT);
    const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

    // Compte total pour la pagination cote client
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM tasks WHERE board = 'archive'`)
      .get() as { total: number };

    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE board = 'archive'
         ORDER BY archived_at DESC, id DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as Task[];

    logger.info('api/archive', `GET - ${tasks.length}/${total} tache(s) archivee(s) (offset=${offset})`);
    return NextResponse.json({ tasks, total, limit, offset });
  } catch (error) {
    logger.error('api/archive', `GET - Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la recuperation des archives' }, { status: 500 });
  }
}

/**
 * Restaure une tache archivee en la remettant dans la file d'attente.
 * @param request - Requete contenant { task_id: number }
 * @returns La tache restauree en JSON
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
      return NextResponse.json({ error: 'Tache archivee introuvable' }, { status: 404 });
    }

    // Remet la tache en file d'attente avec le statut "waiting"
    db.prepare(`
      UPDATE tasks
      SET board = 'waiting', status = 'waiting', archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(body.task_id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(body.task_id) as Task;

    logger.info('api/archive', `POST - Tache id=${body.task_id} restauree en file d'attente`);
    return NextResponse.json(task);
  } catch (error) {
    logger.error('api/archive', `POST - Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la restauration de la tache' }, { status: 500 });
  }
}
