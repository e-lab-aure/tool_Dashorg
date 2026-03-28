/**
 * @module api/uploads/[id]
 * @description Routes API pour servir et supprimer une pièce jointe par son identifiant.
 * GET    : sert le fichier binaire en streaming
 * DELETE : supprime le fichier physique et l'enregistrement en base
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import fs from 'fs';
import type { Attachment } from '@/lib/types';

/**
 * Sert le fichier binaire d'une pièce jointe en streaming.
 * Retourne les headers Content-Type et Content-Disposition appropriés.
 * @param _request - Requête HTTP (non utilisée pour GET)
 * @param params - Paramètres de route contenant l'id de l'attachment
 * @returns Réponse binaire avec le contenu du fichier
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const attachment = db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(id) as Attachment | undefined;

    if (!attachment) {
      return NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });
    }

    // Vérifie que le fichier existe physiquement sur le disque
    if (!fs.existsSync(attachment.filepath)) {
      logger.error('api/uploads', `GET — Fichier manquant sur le disque : ${attachment.filepath}`);
      return NextResponse.json({ error: 'Fichier introuvable sur le serveur' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(attachment.filepath);
    const contentType = attachment.mimetype ?? 'application/octet-stream';

    logger.info('api/uploads', `GET — Fichier servi : id=${id}, filename="${attachment.filename}"`);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${attachment.filename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    logger.error('api/uploads', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la lecture du fichier' }, { status: 500 });
  }
}

/**
 * Supprime une pièce jointe : fichier physique sur le disque et enregistrement en base.
 * @param _request - Requête HTTP (non utilisée pour DELETE)
 * @param params - Paramètres de route contenant l'id de l'attachment
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

    const attachment = db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(id) as Attachment | undefined;

    if (!attachment) {
      return NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });
    }

    // Supprime le fichier physique s'il existe encore
    if (fs.existsSync(attachment.filepath)) {
      fs.unlinkSync(attachment.filepath);
    } else {
      logger.warning('api/uploads', `DELETE — Fichier déjà absent du disque : ${attachment.filepath}`);
    }

    // Supprime l'enregistrement en base
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);

    logger.info('api/uploads', `DELETE — Pièce jointe supprimée : id=${id}, filename="${attachment.filename}"`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/uploads', `DELETE — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de la pièce jointe' }, { status: 500 });
  }
}
