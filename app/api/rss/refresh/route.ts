/**
 * @module api/rss/refresh
 * @description Route API pour déclencher manuellement le rafraîchissement de tous les flux RSS.
 * POST : lance la récupération des articles depuis tous les flux enregistrés
 */

import { NextResponse } from 'next/server';
import { refreshAllFeeds } from '@/lib/rss';
import { logger } from '@/lib/logger';

/**
 * Déclenche un rafraîchissement manuel de tous les flux RSS.
 * @returns Nombre de nouveaux articles importés
 */
export async function POST(): Promise<NextResponse> {
  try {
    const count = await refreshAllFeeds();
    logger.info('api/rss/refresh', `POST  -  ${count} nouvel(s) article(s) importé(s)`);
    return NextResponse.json({ imported: count });
  } catch (error) {
    logger.error('api/rss/refresh', `POST  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors du rafraîchissement RSS' }, { status: 500 });
  }
}
