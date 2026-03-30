/**
 * @module api/rss/articles/[id]
 * @description Route API pour marquer un article RSS comme lu (suppression).
 * DELETE : supprime l'article de la base  -  il disparaît du bandeau
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Paramètres de route */
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Marque un article comme lu en le supprimant de la base.
 * Une fois supprimé, il ne sera plus réimporté grâce à l'index UNIQUE sur url.
 * @param _request - Requête HTTP (non utilisée)
 * @param params - Paramètres de route contenant l'id de l'article
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

    const result = db.prepare('DELETE FROM rss_articles WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
    }

    logger.info('api/rss/articles', `DELETE  -  Article lu et supprimé : id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('api/rss/articles', `DELETE  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la suppression de l\'article' }, { status: 500 });
  }
}
