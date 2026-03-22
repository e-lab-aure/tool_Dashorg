'use client';

/**
 * @module WaitingQueue
 * @description Liste des tâches en attente.
 * Permet d'injecter une tâche en attente vers le tableau "aujourd'hui" ou "demain".
 */

import type { Task } from '@/lib/types';

/** Props du composant WaitingQueue */
interface WaitingQueueProps {
  /** Tâches avec board = 'waiting' ou status = 'waiting' */
  tasks: Task[];
  /**
   * Callback déclenché après injection d'une tâche.
   * @param task - Tâche mise à jour après injection
   * @param tomorrowSlot - Slot locked créé dans tomorrow lors d'une injection vers today, ou null
   */
  onInject: (task: Task, tomorrowSlot: Task | null) => void;
}

/**
 * Composant affichant la file d'attente des tâches avec options d'injection.
 */
export default function WaitingQueue({ tasks, onInject }: WaitingQueueProps) {
  /**
   * Injecte une tâche dans le tableau cible via l'API.
   * Remet le statut à 'todo' et change le board de destination.
   * Pour une injection vers today, l'API peut créer un slot locked dans tomorrow.
   * @param task - Tâche à injecter
   * @param targetBoard - Tableau de destination ('today' ou 'tomorrow')
   */
  async function handleInject(task: Task, targetBoard: 'today' | 'tomorrow'): Promise<void> {
    try {
      if (targetBoard === 'today') {
        // L'API /api/tasks/[id] retourne { task, tomorrowSlot, deletedTomorrowSlotId }
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: 'today', status: 'todo' }),
        });

        if (!response.ok) throw new Error('Erreur lors de l\'injection de la tâche');

        const { task: updated, tomorrowSlot } = await response.json() as {
          task: Task;
          tomorrowSlot: Task | null;
          deletedTomorrowSlotId: number | null;
        };

        onInject(updated, tomorrowSlot ?? null);
      } else {
        // L'API /api/tasks/[id] gère le changement de board et retourne { task, tomorrowSlot, deletedTomorrowSlotId }
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: 'tomorrow', status: 'todo', slot_type: 'free' }),
        });

        if (!response.ok) throw new Error('Erreur lors de l\'injection de la tâche');

        const { task: updated } = await response.json() as {
          task: Task;
          tomorrowSlot: Task | null;
          deletedTomorrowSlotId: number | null;
        };
        onInject(updated, null);
      }
    } catch {
      // Échec de l'injection — l'état local n'est pas modifié
    }
  }

  if (tasks.length === 0) {
    return (
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">File d&apos;attente</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucune tâche en attente</p>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        File d&apos;attente
        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
          {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
        </span>
      </h2>

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700"
          >
            {/* Titre de la tâche en attente */}
            <span className="flex-1 text-sm text-gray-900 dark:text-white truncate" title={task.title}>
              {task.title}
            </span>

            {/* Boutons d'injection */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleInject(task, 'today')}
                className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                title="Injecter dans le tableau aujourd'hui"
              >
                → Aujourd&apos;hui
              </button>
              <button
                onClick={() => handleInject(task, 'tomorrow')}
                className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-colors"
                title="Injecter dans le tableau demain"
              >
                → Demain
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
