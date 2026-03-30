/**
 * @module api/sync
 * @description Route API de synchronisation manuelle des emails IMAP.
 * Déclenche immédiatement un polling IMAP à la demande, indépendamment du cron automatique.
 * POST : lance la synchronisation et retourne le bilan (items créés, emails ignorés)
 */

import { NextResponse } from 'next/server';
import { pollImap } from '@/lib/imap';
import { logger } from '@/lib/logger';

/**
 * Déclenche manuellement une synchronisation IMAP et retourne le bilan.
 * @returns { created: number, ignored: number }  -  bilan de la synchronisation
 */
export async function POST(): Promise<NextResponse> {
  logger.info('api/sync', 'Synchronisation manuelle déclenchée');

  try {
    const result = await pollImap();

    logger.info(
      'api/sync',
      `Synchronisation terminée  -  créés: ${result.created}, ignorés: ${result.ignored}`
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error('api/sync', `Erreur lors de la synchronisation : ${(error as Error).message}`);
    return NextResponse.json(
      { error: 'Erreur lors de la synchronisation des emails' },
      { status: 500 }
    );
  }
}
