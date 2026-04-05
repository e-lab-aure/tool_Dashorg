/**
 * @module api/lists/[id]/images
 * @description Upload d'un fichier (image ou document) vers un item de liste.
 * POST : reçoit un fichier multipart, le sauvegarde sur disque et en base.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { LISTS_UPLOADS_BASE, MAX_UPLOAD_SIZE_BYTES } from '@/lib/config';
import fs from 'fs';
import path from 'path';
import type { ListItemImage } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Uploade un fichier et l'associe à un item de liste.
 * @param req - Requête multipart/form-data contenant le champ "file"
 * @param params - Paramètres de route contenant l'id de l'item
 */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: rawId } = await params;
    const itemId = parseInt(rawId, 10);

    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const item = db.prepare('SELECT id FROM list_items WHERE id = ?').get(itemId);
    if (!item) {
      return NextResponse.json({ error: 'Item introuvable' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      const maxMo = MAX_UPLOAD_SIZE_BYTES / 1024 / 1024;
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${maxMo} Mo)` },
        { status: 413 }
      );
    }

    // Nettoie le nom du fichier : garde alphanumérique, tirets, underscores, points
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${safeName}`;

    const itemDir = path.join(LISTS_UPLOADS_BASE, String(itemId));
    fs.mkdirSync(itemDir, { recursive: true });

    const filepath = path.join(itemDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    const result = db.prepare(`
      INSERT INTO list_item_images (list_item_id, filename, filepath, mimetype, size_bytes)
      VALUES (@list_item_id, @filename, @filepath, @mimetype, @size_bytes)
    `).run({
      list_item_id: itemId,
      filename: file.name,
      filepath,
      mimetype: file.type || null,
      size_bytes: file.size,
    });

    const image = db
      .prepare('SELECT * FROM list_item_images WHERE id = ?')
      .get(result.lastInsertRowid) as ListItemImage;

    logger.info('api/lists/images', `POST - Fichier uploadé : "${file.name}" pour item id=${itemId}`);

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    logger.error('api/lists/images', `POST - Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 });
  }
}
