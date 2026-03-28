/**
 * @module rss
 * @description Logique de récupération et de persistance des articles RSS.
 * Parcourt tous les flux enregistrés, télécharge les articles,
 * extrait image et description, et insère les nouveaux en évitant les doublons.
 */

import Parser from 'rss-parser';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RssFeed } from '@/lib/types';

/** Type étendu pour les items avec les champs media non standards */
type RssItem = Parser.Item & {
  'media:content'?: { $?: { url?: string } };
  'media:thumbnail'?: { $?: { url?: string } };
  'content:encoded'?: string;
  enclosure?: { url?: string; type?: string };
};

const parser = new Parser<Record<string, unknown>, RssItem>({
  timeout: 10000,
  headers: { 'User-Agent': 'Dashorg RSS Reader/1.0' },
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

/**
 * Extrait l'URL de l'image associée à un item RSS.
 * Tente dans l'ordre : enclosure image, media:content, media:thumbnail,
 * puis première balise <img> dans le contenu HTML.
 * @param item - Item RSS parsé
 * @returns URL de l'image ou null si aucune trouvée
 */
function extraireImageUrl(item: RssItem): string | null {
  // 1. Enclosure (format standard pour les médias)
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url;
  }

  // 2. media:content (Yahoo Media RSS)
  const mediaContent = item['media:content'];
  if (mediaContent?.$?.url) return mediaContent.$.url;

  // 3. media:thumbnail
  const mediaThumbnail = item['media:thumbnail'];
  if (mediaThumbnail?.$?.url) return mediaThumbnail.$.url;

  // 4. Première balise <img> dans le contenu HTML (content:encoded ou content)
  const html = item['content:encoded'] ?? item.content ?? '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1]) return match[1];

  return null;
}

/**
 * Extrait un résumé texte brut depuis un item RSS.
 * Utilise contentSnippet (déjà nettoyé par rss-parser) ou retire les balises HTML du contenu.
 * Tronque à 300 caractères pour limiter la taille en base.
 * @param item - Item RSS parsé
 * @returns Description en texte brut ou null
 */
function extraireDescription(item: RssItem): string | null {
  // contentSnippet est le texte brut fourni directement par rss-parser
  if (item.contentSnippet?.trim()) {
    return item.contentSnippet.trim().slice(0, 300);
  }

  // Fallback : retire les balises HTML du contenu brut
  const html = item['content:encoded'] ?? item.content ?? item.summary ?? '';
  if (!html) return null;

  const texte = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return texte.slice(0, 300) || null;
}

/**
 * Rafraîchit un flux RSS individuel.
 * Télécharge le flux, insère les nouveaux articles avec image et description.
 * Les doublons (même URL) sont ignorés via INSERT OR IGNORE.
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
    INSERT OR IGNORE INTO rss_articles (feed_id, title, url, description, image_url, published_at)
    VALUES (@feed_id, @title, @url, @description, @image_url, @published_at)
  `);

  let inserted = 0;

  for (const item of parsed.items ?? []) {
    if (!item.link || !item.title) continue;

    const result = stmt.run({
      feed_id: feed.id,
      title: item.title.trim(),
      url: item.link.trim(),
      description: extraireDescription(item),
      image_url: extraireImageUrl(item),
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
