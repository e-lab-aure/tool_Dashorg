/**
 * @module api/rss/articles
 * @description Route API pour la récupération des articles RSS.
 * GET : retourne les articles triés par date décroissante avec pagination.
 *       Paramètres : offset (défaut 0), limit (défaut 20, max 50), feed_id (optionnel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RssArticle } from '@/lib/types';

/**
 * Retourne les articles RSS paginés, les plus récents en premier.
 * @param request - Requête avec paramètres optionnels : offset, limit, feed_id
 * @returns Liste paginée des articles en JSON
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20));
    const feedId = searchParams.get('feed_id');

    let query: string;
    let params: unknown[];

    if (feedId) {
      const fid = parseInt(feedId, 10);
      if (isNaN(fid)) {
        return NextResponse.json({ error: 'feed_id invalide' }, { status: 400 });
      }
      query = `
        SELECT
          a.id, a.feed_id, f.name AS feed_name,
          a.title, a.url, a.description, a.image_url,
          a.published_at, a.created_at
        FROM rss_articles a
        JOIN rss_feeds f ON f.id = a.feed_id
        WHERE a.feed_id = ?
        ORDER BY COALESCE(a.published_at, a.created_at) DESC
        LIMIT ? OFFSET ?
      `;
      params = [fid, limit, offset];
    } else {
      query = `
        SELECT
          a.id, a.feed_id, f.name AS feed_name,
          a.title, a.url, a.description, a.image_url,
          a.published_at, a.created_at
        FROM rss_articles a
        JOIN rss_feeds f ON f.id = a.feed_id
        ORDER BY COALESCE(a.published_at, a.created_at) DESC
        LIMIT ? OFFSET ?
      `;
      params = [limit, offset];
    }

    const articles = db.prepare(query).all(...params) as RssArticle[];

    logger.info('api/rss/articles', `GET — ${articles.length} article(s) retourné(s) (offset=${offset}, limit=${limit})`);
    return NextResponse.json(articles);
  } catch (error) {
    logger.error('api/rss/articles', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des articles' }, { status: 500 });
  }
}
