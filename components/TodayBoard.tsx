'use client';

/**
 * @module TodayBoard
 * @description Tableau des tâches du jour.
 * Affiche 5 slots (remplis ou vides), permet de créer des tâches et de changer leur statut
 * via un sélecteur déroulant. Chaque création de tâche génère aussi un slot verrouillé dans demain.
 */

import { useState } from 'react';
import type { Task } from '@/lib/types';

/** Props du composant TodayBoard */
interface TodayBoardProps {
  /** Tâches du board "today" */
  tasks: Task[];
  /** Callback après mise à jour d'une tâche */
  onUpdate: (task: Task) => void;
  /** Callback pour sélectionner une tâche (ouvre TaskDetail) */
  onSelect: (task: Task) => void;
  /** Callback après création d'un slot verrouillé dans tomorrow */
  onTomorrowAdd: (task: Task) => void;
  /**
   * Callback déclenché quand un changement de statut entraîne la création
   * ou la suppression d'un slot verrouillé dans tomorrow.
   * @param slot - Slot créé dans tomorrow, ou null si aucun
   * @param deletedId - Identifiant du slot supprimé dans tomorrow, ou null si aucun
   */
  onTomorrowChange: (slot: Task | null, deletedId: number | null) => void;
}

/** Nombre maximum de slots dans le tableau du jour */
const MAX_SLOTS = 5;

/** Libellés des statuts affichés dans le sélecteur */
const STATUS_LABELS: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
  waiting: 'En attente',
};

/** Classes de couleur par statut pour le badge visuel */
const STATUS_COLORS: Record<string, string> = {
  todo: 'text-gray-500',
  in_progress: 'text-blue-500',
  done: 'text-green-500',
  waiting: 'text-orange-400',
};

/**
 * Composant du tableau des tâches du jour avec 5 slots fixes.
 * Le statut de chaque tâche est modifiable via un menu déroulant.
 */
export default function TodayBoard({ tasks, onUpdate, onSelect, onTomorrowAdd, onTomorrowChange }: TodayBoardProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingSlot, setCreatingSlot] = useState<number | null>(null);

  /**
   * Met à jour le statut d'une tâche via l'API suite à la sélection dans le dropdown.
   * Notifie le parent des éventuels changements sur les slots tomorrow via onTomorrowChange.
   * @param task - Tâche à mettre à jour
   * @param newStatus - Nouveau statut sélectionné
   */
  async function handleStatusChange(task: Task, newStatus: string): Promise<void> {
    if (newStatus === task.status) return;

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour du statut');

      const { task: updated, tomorrowSlot, deletedTomorrowSlotId } = await response.json() as {
        task: Task;
        tomorrowSlot: Task | null;
        deletedTomorrowSlotId: number | null;
      };

      onUpdate(updated);

      // Notifie le parent si un slot tomorrow a été créé ou supprimé
      if (tomorrowSlot !== null || deletedTomorrowSlotId !== null) {
        onTomorrowChange(tomorrowSlot, deletedTomorrowSlotId);
      }
    } catch {
      // Échec de la mise à jour — l'état local n'est pas modifié
    }
  }

  /**
   * Crée une nouvelle tâche dans le slot vide sélectionné.
   * L'API retourne aussi un slot verrouillé pour demain, transmis au parent via onTomorrowAdd.
   * @param position - Position du slot à remplir
   */
  async function handleCreateTask(position: number): Promise<void> {
    if (!newTaskTitle.trim()) return;

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle.trim(), position }),
      });

      if (!response.ok) throw new Error('Erreur lors de la création de la tâche');

      const { task, tomorrowSlot } = await response.json() as { task: Task; tomorrowSlot: Task | null };

      onUpdate(task);

      // Notifie le parent du slot verrouillé créé dans demain
      if (tomorrowSlot) {
        onTomorrowAdd(tomorrowSlot);
      }

      setNewTaskTitle('');
      setCreatingSlot(null);
    } catch {
      setCreatingSlot(null);
    }
  }

  /**
   * Gère la soumission du formulaire de création rapide (touche Entrée ou blur).
   * @param position - Position du slot en cours de création
   */
  function handleSubmitNew(position: number): void {
    if (newTaskTitle.trim()) {
      handleCreateTask(position);
    } else {
      setCreatingSlot(null);
    }
  }

  // Génère un tableau de 5 slots, les positions non occupées sont null
  const slots: (Task | null)[] = Array.from({ length: MAX_SLOTS }, (_, i) => {
    return tasks.find((t) => t.position === i + 1) ?? null;
  });

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        Aujourd&apos;hui
        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
          {tasks.length}/{MAX_SLOTS}
        </span>
      </h2>

      <ul className="space-y-2">
        {slots.map((task, index) => {
          const slotNumber = index + 1;

          // Slot occupé par une tâche
          if (task) {
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                {/* Sélecteur de statut — plus précis qu'une icône cyclique */}
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-xs font-medium bg-transparent border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 cursor-pointer shrink-0 ${STATUS_COLORS[task.status] ?? 'text-gray-500'} dark:text-white`}
                  aria-label={`Statut de : ${task.title}`}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value} className="text-gray-900">
                      {label}
                    </option>
                  ))}
                </select>

                {/* Titre cliquable — ouvre le panneau de détail */}
                <button
                  onClick={() => onSelect(task)}
                  className="flex-1 text-left text-sm text-gray-900 dark:text-white truncate hover:text-blue-600 dark:hover:text-blue-400"
                  title={task.title}
                >
                  {task.title}
                </button>
              </li>
            );
          }

          // Slot vide en cours de création
          if (creatingSlot === slotNumber) {
            return (
              <li key={`empty-${slotNumber}`} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                <input
                  type="text"
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmitNew(slotNumber);
                    if (e.key === 'Escape') { setCreatingSlot(null); setNewTaskTitle(''); }
                  }}
                  onBlur={() => handleSubmitNew(slotNumber)}
                  placeholder="Titre de la tâche..."
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder-gray-400"
                />
              </li>
            );
          }

          // Slot vide avec bouton "+"
          return (
            <li key={`empty-${slotNumber}`} className="p-3 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
              {tasks.length < MAX_SLOTS ? (
                <button
                  onClick={() => { setCreatingSlot(slotNumber); setNewTaskTitle(''); }}
                  className="w-full text-left text-sm text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400"
                >
                  + Ajouter une tâche
                </button>
              ) : (
                <span className="text-sm text-gray-300 dark:text-gray-600">Slot vide</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
