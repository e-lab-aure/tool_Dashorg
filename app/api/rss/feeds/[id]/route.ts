/**
 * @module api/rss/feeds/[id]
 * @description Routes API pour la gestion individuelle d'un flux RSS.
 * DELETE : supprime le flux et tous ses articles (CASCADE)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Paramètres de route */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Supprime un flux RSS et tous ses articles associés.
 * @param _request - Requête HTTP (non utilisée)
 * @param params - Paramètres de route contenant l'id du flux
 * @returns Confirmation de suppression
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const result = db.prepare('DELETE FROM rss_feeds WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Flux introuvable' }, { status: 404 });
    }

    logger.info('api/rss/feeds', `DELETE  -  Flux supprimé : id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/rss/feeds', `DELETE  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression du flux' }, { status: 500 });
  }
}
