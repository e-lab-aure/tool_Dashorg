'use client';

/**
 * @module ArchivePanel
 * @description Panneau d'affichage des tâches archivées.
 * Les tâches terminées sont archivées automatiquement au rollover de 6h00.
 * Chaque tâche peut être remise en file d'attente si elle revient.
 */

import { useState } from 'react';
import type { Task } from '@/lib/types';

/** Props du composant ArchivePanel */
interface ArchivePanelProps {
  /** Liste des tâches archivées */
  tasks: Task[];
  /** Callback après restauration d'une tâche en file d'attente */
  onRestore: (task: Task) => void;
}

/**
 * Formate une date ISO en chaîne lisible (ex: "21 mars 2026").
 * @param dateStr - Date ISO ou DATETIME SQLite
 * @returns Date formatée en français
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Composant panneau des archives.
 * Affichage replié par défaut pour ne pas encombrer l'interface.
 */
export default function ArchivePanel({ tasks, onRestore }: ArchivePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [errorId, setErrorId] = useState<number | null>(null);

  /**
   * Restaure une tâche archivée en file d'attente via l'API.
   * @param task - Tâche à restaurer
   */
  async function handleRestore(task: Task): Promise<void> {
    if (restoringId !== null) return;

    setRestoringId(task.id);
    setErrorId(null);

    try {
      const response = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      });

      if (!response.ok) throw new Error('Erreur lors de la restauration');

      const restored = await response.json() as Task;
      onRestore(restored);
    } catch (err) {
      setErrorId(task.id);
      // Efface le message d'erreur après 3 secondes
      setTimeout(() => setErrorId(null), 3000);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow">
      {/* En-tête cliquable pour déplier/replier */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Archives
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
            {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
          </span>
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-xs">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Contenu déplié */}
      {isOpen && (
        <div className="px-4 pb-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
              Aucune tâche archivée.
            </p>
          ) : (
            <ul className="space-y-2 mt-1">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    {/* Titre avec style "barré" pour indiquer que c'est fait */}
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate line-through">
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Archivé le {formatDate(task.archived_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Message d'erreur inline */}
                    {errorId === task.id && (
                      <span className="text-xs text-red-400">Erreur</span>
                    )}

                    {/* Bouton de restauration en file d'attente */}
                    <button
                      onClick={() => handleRestore(task)}
                      disabled={restoringId !== null}
                      className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Remettre en file d'attente"
                    >
                      {restoringId === task.id ? '...' : '↩ En attente'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
