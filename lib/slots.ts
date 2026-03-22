/**
 * @module slots
 * @description Logique de calcul des slots disponibles pour le tableau "demain".
 * Les slots verrouillés correspondent aux tâches non terminées d'aujourd'hui,
 * les slots libres correspondent aux tâches terminées ou en attente.
 */

import { db } from '@/lib/db';
import type { TomorrowSlots } from '@/lib/types';

/**
 * Calcule le nombre de slots verrouillés et libres pour le tableau "demain".
 *
 * Règle métier :
 * - Slots verrouillés = tâches "todo" ou "in_progress" du board "today"
 *   (elles seront reportées demain lors du rollover)
 * - Slots libres = tâches "done" ou "waiting" du board "today"
 *   (elles libèrent de la place pour demain)
 *
 * @returns Objet contenant le nombre de slots verrouillés, libres et total
 */
export function computeTomorrowSlots(): TomorrowSlots {
  // Compte les tâches non terminées d'aujourd'hui qui seront reportées demain
  const lockedResult = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM tasks
       WHERE board = 'today'
         AND status IN ('todo', 'in_progress')`
    )
    .get() as { cnt: number };

  // Compte les tâches terminées ou en attente qui libèrent un slot demain
  const freeResult = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM tasks
       WHERE board = 'today'
         AND status IN ('done', 'waiting')`
    )
    .get() as { cnt: number };

  const locked = lockedResult.cnt;
  const free = freeResult.cnt;

  return {
    locked,
    free,
    total: locked + free,
  };
}
