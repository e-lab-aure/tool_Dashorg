'use client';

/**
 * @module TomorrowBoard
 * @description Tableau de planification des tâches du lendemain.
 * Affiche 5 slots maximum :
 * - Slots "locked" : grisés et non éditables (reportés depuis aujourd'hui)
 * - Slots "free"   : titre et description éditables inline, supprimables, replaçables en attente
 */

import { useState } from 'react';
import type { Task } from '@/lib/types';

/** Props du composant TomorrowBoard */
interface TomorrowBoardProps {
  /** Tâches du board "tomorrow" */
  tasks: Task[];
  /** Callback après mise à jour d'un slot (board inclus) */
  onUpdate: (task: Task) => void;
  /** Callback pour ajouter un slot libre */
  onAdd: (task: Task) => void;
  /** Callback pour supprimer un slot libre */
  onDelete: (taskId: number) => void;
}

/** Nombre maximum de slots dans le tableau de demain */
const MAX_SLOTS = 5;

/**
 * Composant du tableau de demain avec gestion des slots verrouillés et libres.
 */
export default function TomorrowBoard({ tasks, onUpdate, onAdd, onDelete }: TomorrowBoardProps) {
  // Titres en cours d'édition pour chaque slot libre, indexés par task.id
  const [editingTitles, setEditingTitles] = useState<Record<number, string>>({});
  // Descriptions en cours d'édition pour chaque slot libre, indexées par task.id
  const [editingDescriptions, setEditingDescriptions] = useState<Record<number, string>>({});

  /**
   * Met à jour le titre d'un slot free via l'API tomorrow et notifie le parent.
   * @param task - Slot à mettre à jour
   * @param newTitle - Nouveau titre saisi
   */
  async function handleTitleSave(task: Task, newTitle: string): Promise<void> {
    const trimmed = newTitle.trim();
    if (trimmed === task.title || !trimmed) return;

    try {
      const response = await fetch(`/api/tomorrow/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour du titre');

      const updated = await response.json() as Task;
      onUpdate(updated);

      setEditingTitles((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    } catch (err) {
    }
  }

  /**
   * Met à jour la description d'un slot free via l'API tomorrow et notifie le parent.
   * @param task - Slot à mettre à jour
   * @param newDescription - Nouvelle description saisie
   */
  async function handleDescriptionSave(task: Task, newDescription: string): Promise<void> {
    const trimmed = newDescription.trim();
    const currentDescription = task.description ?? '';
    if (trimmed === currentDescription) return;

    try {
      const response = await fetch(`/api/tomorrow/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: trimmed || null }),
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour de la description');

      const updated = await response.json() as Task;
      onUpdate(updated);

      setEditingDescriptions((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    } catch (err) {
    }
  }

  /**
   * Remet un slot free en file d'attente via l'API tasks.
   * Utilise /api/tasks/[id] car /api/tomorrow/[id] ne gère pas les changements de board.
   * L'appelant (onUpdate) retire la tâche de tomorrowTasks et l'ajoute à waitingTasks.
   * @param task - Slot à remettre en attente
   */
  async function handleSendToWaiting(task: Task): Promise<void> {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: 'waiting', status: 'waiting' }),
      });

      if (!response.ok) throw new Error('Erreur lors du retour en attente');

      const { task: updated } = await response.json() as {
        task: Task;
        tomorrowSlot: Task | null;
        deletedTomorrowSlotId: number | null;
      };
      onUpdate(updated);
    } catch (err) {
    }
  }

  /**
   * Supprime un slot libre via l'API.
   * @param taskId - Identifiant du slot à supprimer
   */
  async function handleDelete(taskId: number): Promise<void> {
    try {
      const response = await fetch(`/api/tomorrow/${taskId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      onDelete(taskId);
    } catch (err) {
    }
  }

  /**
   * Ajoute un nouveau slot libre via l'API.
   */
  async function handleAddFreeSlot(): Promise<void> {
    if (tasks.length >= MAX_SLOTS) return;

    try {
      const response = await fetch('/api/tomorrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nouveau slot' }),
      });

      if (!response.ok) throw new Error('Erreur lors de la création du slot');

      const task = await response.json() as Task;
      onAdd(task);
    } catch (err) {
    }
  }

  // Génère les 5 slots en complétant avec des slots "vides" si besoin
  const slots: Task[] = tasks.slice(0, MAX_SLOTS);
  const emptySlots = Math.max(0, MAX_SLOTS - slots.length);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        Demain
        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
          {tasks.length}/{MAX_SLOTS}
        </span>
      </h2>

      <ul className="space-y-2">
        {/* Affichage des slots existants */}
        {slots.map((task) => {
          const isLocked = task.slot_type === 'locked';

          if (isLocked) {
            // Slot verrouillé : grisé et non éditable
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 opacity-60"
                title="Ce slot est verrouillé (reporté depuis aujourd'hui)"
              >
                <span className="text-xl shrink-0">🔒</span>
                <span className="flex-1 text-sm text-gray-500 dark:text-gray-400 truncate italic">
                  {task.title}
                </span>
              </li>
            );
          }

          // Slot libre : titre et description éditables inline
          const currentTitle = editingTitles[task.id] ?? task.title;
          const currentDescription = editingDescriptions[task.id] ?? (task.description ?? '');

          return (
            <li
              key={task.id}
              className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              {/* Ligne titre + actions */}
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">📋</span>

                {/* Titre éditable inline */}
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) =>
                    setEditingTitles((prev) => ({ ...prev, [task.id]: e.target.value }))
                  }
                  onBlur={() => handleTitleSave(task, currentTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSave(task, currentTitle);
                    if (e.key === 'Escape') {
                      setEditingTitles((prev) => {
                        const next = { ...prev };
                        delete next[task.id];
                        return next;
                      });
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none border-b border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-blue-500 transition-colors min-w-0"
                />

                {/* Bouton retour en file d'attente */}
                <button
                  onClick={() => handleSendToWaiting(task)}
                  className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50 transition-colors shrink-0"
                  title="Remettre en file d'attente"
                >
                  ⏳ Attente
                </button>

                {/* Bouton de suppression du slot libre */}
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-red-400 hover:text-red-600 text-xs shrink-0"
                  aria-label={`Supprimer le slot : ${task.title}`}
                >
                  ✕
                </button>
              </div>

              {/* Description éditable inline */}
              <textarea
                value={currentDescription}
                onChange={(e) =>
                  setEditingDescriptions((prev) => ({ ...prev, [task.id]: e.target.value }))
                }
                onBlur={() => handleDescriptionSave(task, currentDescription)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingDescriptions((prev) => {
                      const next = { ...prev };
                      delete next[task.id];
                      return next;
                    });
                  }
                }}
                placeholder="Ajouter une description…"
                rows={1}
                className="mt-1 ml-8 w-[calc(100%-2rem)] bg-transparent text-xs text-gray-500 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 outline-none resize-none border-b border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-blue-400 transition-colors"
              />
            </li>
          );
        })}

        {/* Slots vides */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li
            key={`empty-tomorrow-${i}`}
            className="p-3 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600"
          >
            <span className="text-sm text-gray-300 dark:text-gray-600">Slot disponible</span>
          </li>
        ))}
      </ul>

      {/* Bouton d'ajout d'un slot libre, affiché uniquement si la limite n'est pas atteinte */}
      {tasks.length < MAX_SLOTS && (
        <button
          onClick={handleAddFreeSlot}
          className="mt-3 w-full text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-left"
        >
          + Ajouter un slot libre
        </button>
      )}
    </section>
  );
}
