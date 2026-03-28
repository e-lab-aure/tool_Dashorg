/**
 * @module api/rss/feeds
 * @description Routes API pour la gestion des flux RSS.
 * GET  : liste tous les flux enregistrés avec le nombre d'articles non lus
 * POST : ajoute un nouveau flux (url + nom automatique depuis le titre du feed)
 */

import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { RssFeed } from '@/lib/types';

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Dashorg RSS Reader/1.0' } });

/**
 * Retourne la liste de tous les flux RSS avec le nombre d'articles non lus.
 * @returns Liste des flux en JSON
 */
export async function GET(): Promise<NextResponse> {
  try {
    const feeds = db.prepare(`
      SELECT
        f.*,
        COUNT(a.id) AS article_count
      FROM rss_feeds f
      LEFT JOIN rss_articles a ON a.feed_id = f.id
      GROUP BY f.id
      ORDER BY f.created_at ASC
    `).all() as (RssFeed & { article_count: number })[];

    logger.info('api/rss/feeds', `GET — ${feeds.length} flux retourné(s)`);
    return NextResponse.json(feeds);
  } catch (error) {
    logger.error('api/rss/feeds', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la récupération des flux' }, { status: 500 });
  }
}

/** Corps attendu pour l'ajout d'un flux */
interface FeedPostBody {
  url?: string;
  name?: string;
}

/**
 * Ajoute un nouveau flux RSS.
 * Si aucun nom n'est fourni, tente de récupérer le titre depuis le feed lui-même.
 * @param request - Requête contenant { url, name? }
 * @returns Le flux créé en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as FeedPostBody;

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'URL du flux obligatoire' }, { status: 400 });
    }

    const url = body.url.trim();

    // Validation minimale du format URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
    }

    // Résolution du nom : utilisé le nom fourni, sinon récupère le titre du flux
    let name = body.name?.trim() || '';
    if (!name) {
      try {
        const parsed = await parser.parseURL(url);
        name = parsed.title?.trim() || url;
      } catch {
        name = url;
      }
    }

    const existing = db.prepare('SELECT id FROM rss_feeds WHERE url = ?').get(url);
    if (existing) {
      return NextResponse.json({ error: 'Ce flux est déjà enregistré' }, { status: 409 });
    }

    const result = db.prepare('INSERT INTO rss_feeds (url, name) VALUES (?, ?)').run(url, name);
    const feed = db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(result.lastInsertRowid) as RssFeed;

    logger.info('api/rss/feeds', `POST — Flux ajouté : id=${feed.id} name="${feed.name}" url="${feed.url}"`);
    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    logger.error('api/rss/feeds', `POST — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de l\'ajout du flux' }, { status: 500 });
  }
}
