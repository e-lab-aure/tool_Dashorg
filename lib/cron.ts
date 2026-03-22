/**
 * @module cron
 * @description Jobs planifiés pour Dashorg.
 * - Rollover 6h00 : reporte les tâches non terminées d'aujourd'hui vers demain
 * - Poll IMAP toutes les 15 min : importe les emails tagués en items de liste
 *
 * Ce module est importé une seule fois au démarrage de l'application.
 * Un guard global évite le double-init lors du hot-reload en développement.
 */

import cron from 'node-cron';
import { db } from '@/lib/db';
import { pollImap } from '@/lib/imap';
import { logger } from '@/lib/logger';

/**
 * Effectue le rollover des tâches du jour vers demain.
 *
 * Logique :
 * 1. Les tâches "todo" et "in_progress" du board "today" deviennent board "tomorrow" avec slot_type "locked"
 * 2. Les tâches "tomorrow" existantes (slot_type "free") restent inchangées
 * 3. Les tâches du board "tomorrow" (locked + free) basculent vers le board "today"
 * 4. Les positions sont recalculées de 1 à N
 */
function executeRollover(): void {
  logger.info('cron', 'Démarrage du rollover quotidien');

  // Transaction atomique pour garantir la cohérence des données
  const rolloverTransaction = db.transaction(() => {
    // Étape 1 : les tâches terminées du jour partent en archive
    const archivedCount = db
      .prepare(
        `UPDATE tasks
         SET board = 'archive', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE board = 'today' AND status = 'done'`
      )
      .run().changes;

    logger.info('cron', `Rollover — ${archivedCount} tâche(s) terminée(s) archivée(s)`);

    // Étape 2 : les tâches non terminées d'aujourd'hui deviennent des slots verrouillés de demain
    const movedCount = db
      .prepare(
        `UPDATE tasks
         SET board = 'tomorrow', slot_type = 'locked', updated_at = CURRENT_TIMESTAMP
         WHERE board = 'today'
           AND status IN ('todo', 'in_progress')`
      )
      .run().changes;

    logger.info('cron', `Rollover — ${movedCount} tâche(s) reportée(s) de today vers tomorrow`);

    // Étape 3 : les tâches waiting restent dans leur board (waiting)
    // Elles ne participent pas au rollover

    // Étape 4 : toutes les tâches de demain (locked + free) deviennent aujourd'hui
    const promotedCount = db
      .prepare(
        `UPDATE tasks
         SET board = 'today', slot_type = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE board = 'tomorrow'`
      )
      .run().changes;

    logger.info('cron', `Rollover — ${promotedCount} tâche(s) promue(s) de tomorrow vers today`);

    // Étape 5 : réinitialisation des positions de 1 à N pour le board today
    const todayTasks = db
      .prepare("SELECT id FROM tasks WHERE board = 'today' ORDER BY position ASC, id ASC")
      .all() as { id: number }[];

    todayTasks.forEach((task, index) => {
      db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run(index + 1, task.id);
    });

    logger.info('cron', `Rollover — Positions recalculées pour ${todayTasks.length} tâche(s)`);
  });

  try {
    rolloverTransaction();
    logger.info('cron', 'Rollover quotidien terminé avec succès');
  } catch (error) {
    logger.error('cron', `Échec du rollover : ${(error as Error).message}`);
  }
}

/**
 * Exécute le polling IMAP avec gestion des erreurs.
 * Les erreurs sont capturées et loguées sans interrompre le cron.
 */
async function executePollImap(): Promise<void> {
  logger.info('cron', 'Démarrage du polling IMAP');
  try {
    await pollImap();
    logger.info('cron', 'Polling IMAP terminé avec succès');
  } catch (error) {
    logger.error('cron', `Échec du polling IMAP : ${(error as Error).message}`);
  }
}

/**
 * Initialise les jobs cron de l'application.
 * Utilise un guard global pour éviter la double initialisation lors du hot-reload Next.js.
 * Cette fonction est idempotente.
 */
function initCron(): void {
  const globalObj = global as Record<string, unknown>;

  // Guard pour éviter la double initialisation en mode dev (hot-reload)
  if (globalObj['__cronInitialized']) {
    logger.debug('cron', 'Cron déjà initialisé — initialisation ignorée');
    return;
  }

  // Job 1 : rollover quotidien à 6h00 tous les jours
  cron.schedule('0 6 * * *', () => {
    executeRollover();
  }, {
    timezone: 'Europe/Paris',
  });

  logger.info('cron', 'Job planifié : rollover à 6h00 (Europe/Paris)');

  // Job 2 : polling IMAP toutes les 15 minutes
  cron.schedule('*/15 * * * *', () => {
    executePollImap();
  });

  logger.info('cron', 'Job planifié : polling IMAP toutes les 15 minutes');

  // Marque l'initialisation comme effectuée pour éviter les doublons
  globalObj['__cronInitialized'] = true;
  logger.info('cron', 'Initialisation des jobs cron terminée');
}

// Lance l'initialisation au chargement du module
initCron();
