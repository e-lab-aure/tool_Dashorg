/**
 * @module api/rss/articles
 * @description Route API pour la récupération des articles RSS non lus.
 * GET : retourne les articles non lus triés par date de publication décroissante,
 *       avec le nom du flux source.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RssArticle } from '@/lib/types';

/**
 * Retourne les articles RSS non lus, les plus récents en premier.
 * Limite à 100 articles pour éviter une réponse trop volumineuse.
 * @returns Liste des articles non lus en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const articles = db.prepare(`
      SELECT
        a.id,
        a.feed_id,
        f.name AS feed_name,
        a.title,
        a.url,
        a.published_at,
        a.created_at
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      ORDER BY COALESCE(a.published_at, a.created_at) DESC
      LIMIT 100
    `).all() as RssArticle[];

    logger.info('api/rss/articles', `GET — ${articles.length} article(s) retourné(s)`);
    return NextResponse.json(articles);
  } catch (error) {
    logger.error('api/rss/articles', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des articles' }, { status: 500 });
  }
}
