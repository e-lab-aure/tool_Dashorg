/**
 * @module api/uploads
 * @description Routes API pour l'upload et la récupération des pièces jointes.
 * POST : reçoit un fichier multipart/form-data, le stocke sur disque et en base
 * GET  : retourne les pièces jointes d'une tâche via ?task_id=X
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';
import type { Attachment } from '@/lib/types';

/** Répertoire de stockage des uploads selon l'environnement */
const UPLOADS_BASE =
  process.env.NODE_ENV === 'production'
    ? '/app/uploads/tasks'
    : path.join(process.cwd(), 'uploads', 'tasks');

/**
 * Retourne les pièces jointes associées à une tâche.
 * @param request - Requête avec query param ?task_id=X
 * @returns Liste des pièces jointes en JSON
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const taskIdParam = searchParams.get('task_id');

    if (!taskIdParam) {
      return NextResponse.json({ error: 'Paramètre task_id manquant' }, { status: 400 });
    }

    const taskId = parseInt(taskIdParam, 10);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'task_id invalide' }, { status: 400 });
    }

    const attachments = db
      .prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as Attachment[];

    logger.info('api/uploads', `GET — ${attachments.length} pièces jointes pour task_id=${taskId}`);
    return NextResponse.json(attachments);
  } catch (error) {
    logger.error('api/uploads', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des pièces jointes' }, { status: 500 });
  }
}

/**
 * Reçoit un fichier via multipart/form-data, le stocke sur disque et insère un enregistrement en base.
 * Le fichier est stocké dans uploads/tasks/{task_id}/{filename}.
 * @param request - Requête multipart/form-data avec fields "file" et "task_id"
 * @returns La pièce jointe créée en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const taskIdParam = formData.get('task_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (!taskIdParam) {
      return NextResponse.json({ error: 'Champ task_id manquant' }, { status: 400 });
    }

    const taskId = parseInt(taskIdParam, 10);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'task_id invalide' }, { status: 400 });
    }

    // Vérifie que la tâche existe
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 });
    }

    // Sécurise le nom du fichier pour éviter les traversées de répertoire
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const taskDir = path.join(UPLOADS_BASE, String(taskId));

    // Crée le dossier de la tâche si nécessaire
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    // Génère un nom unique pour éviter les collisions
    const timestamp = Date.now();
    const safeFilename = `${timestamp}_${originalName}`;
    const filepath = path.join(taskDir, safeFilename);

    // Écrit le fichier sur le disque en utilisant uniquement fs natif
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filepath, buffer);

    // Insère l'enregistrement en base
    const stmt = db.prepare(`
      INSERT INTO attachments (task_id, filename, filepath, mimetype, size_bytes)
      VALUES (@task_id, @filename, @filepath, @mimetype, @size_bytes)
    `);

    const result = stmt.run({
      task_id: taskId,
      filename: originalName,
      filepath: filepath,
      mimetype: file.type || null,
      size_bytes: file.size,
    });

    const attachment = db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(result.lastInsertRowid) as Attachment;

    logger.info('api/uploads', `POST — Fichier uploadé : "${safeFilename}" pour task_id=${taskId}`);
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    logger.error('api/uploads', `POST — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de l\'upload du fichier' }, { status: 500 });
  }
}
