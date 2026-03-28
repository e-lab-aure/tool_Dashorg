/**
 * @module rss
 * @description Logique de récupération et de persistance des articles RSS.
 * Parcourt tous les flux enregistrés en base, télécharge les articles,
 * et insère les nouveaux en évitant les doublons (index UNIQUE sur url).
 */

import Parser from 'rss-parser';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RssFeed } from '@/lib/types';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Dashorg RSS Reader/1.0' },
});

/**
 * Rafraîchit un flux RSS individuel.
 * Télécharge le flux, insère les nouveaux articles en base.
 * Les doublons (même URL) sont ignorés silencieusement via INSERT OR IGNORE.
 * @param feed - Flux à rafraîchir
 * @returns Nombre de nouveaux articles insérés
 */
async function refreshFeed(feed: RssFeed): Promise<number> {
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    logger.warning('rss', `Flux inaccessible : id=${feed.id} url="${feed.url}" — ${(err as Error).message}`);
    return 0;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rss_articles (feed_id, title, url, published_at)
    VALUES (@feed_id, @title, @url, @published_at)
  `);

  let inserted = 0;

  for (const item of parsed.items ?? []) {
    if (!item.link || !item.title) continue;

    const result = stmt.run({
      feed_id: feed.id,
      title: item.title.trim(),
      url: item.link.trim(),
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    });

    if (result.changes > 0) inserted++;
  }

  logger.info('rss', `Flux rafraîchi : id=${feed.id} name="${feed.name}" — ${inserted} nouvel(s) article(s)`);
  return inserted;
}

/**
 * Rafraîchit tous les flux RSS enregistrés en base.
 * Exécute les requêtes en parallèle pour limiter la durée totale.
 * @returns Nombre total de nouveaux articles insérés toutes sources confondues
 */
export async function refreshAllFeeds(): Promise<number> {
  const feeds = db.prepare('SELECT * FROM rss_feeds ORDER BY id ASC').all() as RssFeed[];

  if (feeds.length === 0) return 0;

  const results = await Promise.allSettled(feeds.map(refreshFeed));

  let total = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') total += r.value;
  }

  return total;
}
