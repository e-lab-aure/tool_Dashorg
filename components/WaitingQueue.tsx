'use client';

/**
 * @module WaitingQueue
 * @description File d'attente des tâches en attente.
 * Permet d'injecter une tâche vers today/tomorrow, de modifier son titre et sa description,
 * d'afficher ses pièces jointes (images depuis IMAP), de l'archiver ou de la supprimer.
 */

import { useState } from 'react';
import type { Task, Attachment } from '@/lib/types';

/** Props du composant WaitingQueue */
interface WaitingQueueProps {
  /** Tâches avec board = 'waiting' */
  tasks: Task[];
  /**
   * Callback déclenché après injection d'une tâche.
   * @param task - Tâche mise à jour après injection
   * @param tomorrowSlot - Slot locked créé dans tomorrow lors d'une injection vers today, ou null
   */
  onInject: (task: Task, tomorrowSlot: Task | null) => void;
  /** Callback déclenché après modification d'une tâche (titre ou description). */
  onUpdate: (task: Task) => void;
  /**
   * Callback déclenché après archivage d'une tâche.
   * @param archivedTask - Tâche archivée retournée par l'API
   */
  onArchive: (archivedTask: Task) => void;
  /**
   * Callback déclenché après suppression d'une tâche.
   * @param taskId - Identifiant de la tâche supprimée
   */
  onDelete: (taskId: number) => void;
  /** Callback pour ouvrir le panneau de détail d'une tâche */
  onSelect: (task: Task) => void;
}

/**
 * Composant affichant la file d'attente avec options d'édition, d'injection, d'archivage et de suppression.
 */
export default function WaitingQueue({ tasks, onInject, onUpdate, onArchive, onDelete, onSelect }: WaitingQueueProps) {
  /** Identifiant de la tâche dont le contenu est déplié */
  const [expandedId, setExpandedId] = useState<number | null>(null);
  /** Identifiant de la tâche en cours d'édition */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  /** Pièces jointes chargées par tâche (null = pas encore chargé) */
  const [taskAttachments, setTaskAttachments] = useState<Record<number, Attachment[]>>({});
  const [saving, setSaving] = useState(false);
  /** Identifiant de la tâche en attente de confirmation de suppression */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  /** URL de l'image ouverte en lightbox, null si aucune */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  /** Nom de fichier de l'image ouverte en lightbox */
  const [lightboxAlt, setLightboxAlt] = useState('');

  /**
   * Charge les pièces jointes d'une tâche depuis l'API uploads.
   * Evite les rechargements si déjà chargées.
   * @param taskId - Identifiant de la tâche
   */
  async function loadAttachments(taskId: number): Promise<void> {
    if (taskId in taskAttachments) return;

    try {
      const res = await fetch(`/api/uploads?task_id=${taskId}`);
      if (res.ok) {
        const data = await res.json() as Attachment[];
        setTaskAttachments((prev) => ({ ...prev, [taskId]: data }));
      } else {
        setTaskAttachments((prev) => ({ ...prev, [taskId]: [] }));
      }
    } catch {
      setTaskAttachments((prev) => ({ ...prev, [taskId]: [] }));
    }
  }

  /**
   * Bascule l'état déplié/replié d'une tâche.
   * Charge les pièces jointes au premier dépliage.
   * Annule l'édition si la tâche est repliée.
   * @param task - Tâche à déplier/replier
   */
  function toggleExpand(task: Task): void {
    const newId = expandedId === task.id ? null : task.id;
    setExpandedId(newId);

    if (newId !== null) {
      loadAttachments(task.id);
    } else if (editingId === task.id) {
      setEditingId(null);
    }
  }

  /**
   * Passe une tâche en mode édition et déplie son contenu.
   * @param task - Tâche à éditer
   */
  function startEdit(task: Task): void {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setExpandedId(task.id);
    loadAttachments(task.id);
  }

  /** Annule l'édition en cours sans sauvegarder. */
  function cancelEdit(): void {
    setEditingId(null);
  }

  /**
   * Sauvegarde les modifications de titre et description via l'API.
   * Met à jour l'état local via onUpdate si l'API répond avec succès.
   * @param taskId - Identifiant de la tâche à mettre à jour
   */
  async function saveEdit(taskId: number): Promise<void> {
    if (!editTitle.trim()) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });

      if (res.ok) {
        const { task } = await res.json() as { task: Task };
        onUpdate(task);
        setEditingId(null);
      }
    } catch {
      // Erreur silencieuse - l'état local n'est pas modifié
    } finally {
      setSaving(false);
    }
  }

  /**
   * Injecte une tâche dans le board cible (today ou tomorrow) via l'API.
   * @param task - Tâche à injecter
   * @param targetBoard - Board de destination
   */
  async function handleInject(task: Task, targetBoard: 'today' | 'tomorrow'): Promise<void> {
    try {
      const body =
        targetBoard === 'today'
          ? { board: 'today', status: 'todo' }
          : { board: 'tomorrow', status: 'todo', slot_type: 'free' };

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) return;

      const { task: updated, tomorrowSlot } = await res.json() as {
        task: Task;
        tomorrowSlot: Task | null;
        deletedTomorrowSlotId: number | null;
      };

      onInject(updated, targetBoard === 'today' ? (tomorrowSlot ?? null) : null);
    } catch {
      // Echec de l'injection - l'état local n'est pas modifié
    }
  }

  /**
   * Archive une tâche en la déplacant vers le board 'archive'.
   * Met à jour les états locaux via onArchive si l'API répond avec succès.
   * @param task - Tâche à archiver
   */
  async function handleArchive(task: Task): Promise<void> {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: 'archive' }),
      });

      if (res.ok) {
        const { task: archivedTask } = await res.json() as { task: Task };
        onArchive(archivedTask);
      }
    } catch {
      // Erreur silencieuse
    }
  }

  /**
   * Supprime définitivement une tâche après confirmation (double clic).
   * Met à jour l'état local via onDelete si l'API répond avec succès.
   * @param task - Tâche à supprimer
   */
  async function handleDelete(task: Task): Promise<void> {
    // Premier clic : demande de confirmation
    if (confirmDeleteId !== task.id) {
      setConfirmDeleteId(task.id);
      // Réinitialise la confirmation après 3 secondes si l'utilisateur ne confirme pas
      setTimeout(() => setConfirmDeleteId((prev) => (prev === task.id ? null : prev)), 3000);
      return;
    }

    // Deuxième clic : suppression effective
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(task.id);
      }
    } catch {
      // Erreur silencieuse
    }
  }

  /**
   * Indique si une pièce jointe est une image affichable.
   * @param att - Pièce jointe à tester
   */
  function isImage(att: Attachment): boolean {
    return !!att.mimetype?.startsWith('image/');
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
        {tasks.map((task) => {
          const isExpanded = expandedId === task.id;
          const isEditing = editingId === task.id;
          const attachments = taskAttachments[task.id] ?? null;
          const awaitingDelete = confirmDeleteId === task.id;

          return (
            <li
              key={task.id}
              className="rounded-lg bg-gray-50 dark:bg-gray-700 overflow-hidden"
            >
              {/* Ligne principale */}
              <div className="flex items-start gap-2 p-3">
                {/* Chevron d'expansion */}
                <button
                  onClick={() => toggleExpand(task)}
                  className="mt-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0 transition-colors w-4 text-center"
                  title={isExpanded ? 'Replier' : 'Deplier'}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>

                {/* Titre cliquable pour ouvrir le détail */}
                <button
                  onClick={() => onSelect(task)}
                  className="flex-1 text-left text-sm text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                  title="Voir le détail"
                >
                  {task.title}
                  {task.source === 'imap' && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-normal">
                      mail
                    </span>
                  )}
                </button>

                {/* Boutons d'action */}
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => handleInject(task, 'today')}
                    className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                    title="Injecter dans aujourd'hui"
                  >
                    → Aujourd&apos;hui
                  </button>
                  <button
                    onClick={() => handleInject(task, 'tomorrow')}
                    className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-colors"
                    title="Injecter dans demain"
                  >
                    → Demain
                  </button>
                  <button
                    onClick={() => startEdit(task)}
                    className="text-xs px-1.5 py-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title="Modifier titre et description"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleArchive(task)}
                    className="text-xs px-1.5 py-1 rounded text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/20 transition-colors"
                    title="Archiver cette tâche"
                  >
                    🗄️
                  </button>
                  <button
                    onClick={() => handleDelete(task)}
                    className={`text-xs px-1.5 py-1 rounded transition-colors ${
                      awaitingDelete
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20'
                    }`}
                    title={awaitingDelete ? 'Cliquer à nouveau pour confirmer' : 'Supprimer cette tâche'}
                  >
                    {awaitingDelete ? '🗑️ ?' : '🗑️'}
                  </button>
                </div>
              </div>

              {/* Zone dépliée : description + pièces jointes ou formulaire d'édition */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-600">
                  {isEditing ? (
                    /* Mode édition inline */
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Titre de la tâche"
                        autoFocus
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={4}
                        className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        placeholder="Description (optionnelle)"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(task.id)}
                          disabled={saving || !editTitle.trim()}
                          className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {saving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-3 py-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Mode lecture : description + pièces jointes */
                    <div className="mt-3 space-y-3">
                      {task.description ? (
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                          {task.description}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                          Aucune description
                        </p>
                      )}

                      {/* Pièces jointes */}
                      {attachments === null ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Chargement des fichiers...
                        </p>
                      ) : attachments.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {attachments.length} fichier{attachments.length > 1 ? 's' : ''} joint{attachments.length > 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {attachments.map((att) =>
                              isImage(att) ? (
                                /* Miniature cliquable - ouvre la lightbox */
                                <button
                                  key={att.id}
                                  onClick={() => {
                                    setLightboxUrl(`/api/uploads/${att.id}`);
                                    setLightboxAlt(att.filename);
                                  }}
                                  title={att.filename}
                                  className="block"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/uploads/${att.id}`}
                                    alt={att.filename}
                                    className="h-20 w-20 object-cover rounded border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                                  />
                                </button>
                              ) : (
                                /* Lien de téléchargement pour les autres fichiers */
                                <a
                                  key={att.id}
                                  href={`/api/uploads/${att.id}`}
                                  download={att.filename}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                                >
                                  📎 {att.filename}
                                </a>
                              )
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* Lightbox - fond sombre cliquable pour fermer */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightboxAlt}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt={lightboxAlt}
            className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl leading-none hover:text-gray-300 transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
