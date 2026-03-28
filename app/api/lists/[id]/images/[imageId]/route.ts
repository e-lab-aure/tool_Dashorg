/**
 * @module api/lists/[id]/images/[imageId]
 * @description Routes API pour servir et supprimer une image liée à un item de liste.
 * GET    : sert le fichier image en streaming avec le bon Content-Type
 * DELETE : supprime l'image sur le disque et en base de données
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import fs from 'fs';
import type { ListItemImage } from '@/lib/types';

/** Paramètres de route : id de l'item et id de l'image */
interface RouteParams {
  params: Promise<{ id: string; imageId: string }>;
}

/**
 * Sert le fichier image d'un item de liste en streaming.
 * Vérifie que l'image appartient bien à l'item demandé.
 * @param _request - Requête HTTP (non utilisée)
 * @param params - Paramètres de route contenant l'id de l'item et l'id de l'image
 * @returns Réponse binaire avec le contenu de l'image
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: rawItemId, imageId: rawImageId } = await params;
    const itemId = parseInt(rawItemId, 10);
    const imageId = parseInt(rawImageId, 10);

    if (isNaN(itemId) || isNaN(imageId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const image = db
      .prepare('SELECT * FROM list_item_images WHERE id = ? AND list_item_id = ?')
      .get(imageId, itemId) as ListItemImage | undefined;

    if (!image) {
      return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });
    }

    if (!fs.existsSync(image.filepath)) {
      logger.error('api/lists/images', `GET — Fichier manquant sur le disque : ${image.filepath}`);
      return NextResponse.json({ error: 'Fichier introuvable sur le serveur' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(image.filepath);
    const contentType = image.mimetype ?? 'image/jpeg';

    logger.info('api/lists/images', `GET — Image servie : id=${imageId}, filename="${image.filename}"`);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${image.filename}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error('api/lists/images', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la lecture du fichier' }, { status: 500 });
  }
}

/**
 * Supprime une image d'un item de liste : fichier physique et enregistrement en base.
 * @param _request - Requête HTTP (non utilisée)
 * @param params - Paramètres de route contenant l'id de l'item et l'id de l'image
 * @returns Confirmation de suppression
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: rawItemId, imageId: rawImageId } = await params;
    const itemId = parseInt(rawItemId, 10);
    const imageId = parseInt(rawImageId, 10);

    if (isNaN(itemId) || isNaN(imageId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const image = db
      .prepare('SELECT * FROM list_item_images WHERE id = ? AND list_item_id = ?')
      .get(imageId, itemId) as ListItemImage | undefined;

    if (!image) {
      return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });
    }

    // Supprime le fichier physique s'il existe encore
    if (fs.existsSync(image.filepath)) {
      fs.unlinkSync(image.filepath);
    } else {
      logger.warning('api/lists/images', `DELETE — Fichier déjà absent du disque : ${image.filepath}`);
    }

    db.prepare('DELETE FROM list_item_images WHERE id = ?').run(imageId);

    logger.info('api/lists/images', `DELETE — Image supprimée : id=${imageId}, filename="${image.filename}"`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/lists/images', `DELETE — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de l\'image' }, { status: 500 });
  }
}
