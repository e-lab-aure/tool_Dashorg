'use client';

/**
 * @module ArchivePanel
 * @description Panneau d'affichage des taches archivees avec pagination.
 * Les taches terminees sont archivees automatiquement au rollover de 6h00.
 * Affiche les 50 premieres taches, puis charge les suivantes a la demande.
 */

import { useState } from 'react';
import type { Task } from '@/lib/types';

/** Props du composant ArchivePanel */
interface ArchivePanelProps {
  /** Taches archivees deja chargees */
  tasks: Task[];
  /** Nombre total de taches archivees en base (pour afficher le compteur et le bouton "voir plus") */
  total: number;
  /** Callback apres restauration d'une tache en file d'attente */
  onRestore: (task: Task) => void;
  /** Callback pour charger la prochaine page d'archives */
  onLoadMore: () => Promise<void>;
  /** Indique si un chargement supplementaire est en cours */
  isLoadingMore: boolean;
}

/**
 * Formate une date ISO en chaine lisible (ex: "21 mars 2026").
 * @param dateStr - Date ISO ou DATETIME SQLite
 * @returns Date formatee en francais
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Composant panneau des archives.
 * Affichage replie par defaut pour ne pas encombrer l'interface.
 * Inclut un bouton "Voir plus" quand toutes les archives ne sont pas encore chargees.
 */
export default function ArchivePanel({
  tasks,
  total,
  onRestore,
  onLoadMore,
  isLoadingMore,
}: ArchivePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [errorId, setErrorId] = useState<number | null>(null);

  /** Nombre d'archives non encore chargees */
  const remaining = Math.max(0, total - tasks.length);

  /**
   * Restaure une tache archivee en file d'attente via l'API.
   * @param task - Tache a restaurer
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
    } catch {
      setErrorId(task.id);
      // Efface le message d'erreur apres 3 secondes
      setTimeout(() => setErrorId(null), 3000);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow">
      {/* En-tete cliquable pour deplier/replier */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Archives
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
            {total} tache{total > 1 ? 's' : ''}
          </span>
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-xs">
          {isOpen ? '\u25b2' : '\u25bc'}
        </span>
      </button>

      {/* Contenu deplie */}
      {isOpen && (
        <div className="px-4 pb-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
              Aucune tache archivee.
            </p>
          ) : (
            <>
              <ul className="space-y-2 mt-1">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Titre avec style "barre" pour indiquer que c'est fait */}
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate line-through">
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Archive le {formatDate(task.archived_at)}
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
                        {restoringId === task.id ? '...' : '\u21a9 En attente'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Bouton "Voir plus" si des archives supplementaires existent en base */}
              {remaining > 0 && (
                <div className="mt-3 flex items-center justify-center">
                  <button
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoadingMore
                      ? 'Chargement...'
                      : `Voir ${remaining} archive${remaining > 1 ? 's' : ''} de plus`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
