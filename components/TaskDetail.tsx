'use client';

/**
 * @module TaskDetail
 * @description Panneau latéral glissant (slide-in depuis la droite) pour afficher
 * et éditer le détail d'une tâche, incluant ses pièces jointes.
 * Les modifications de titre et de description sont sauvegardées automatiquement au blur.
 */

import { useState, useEffect, useRef } from 'react';
import type { Task, Attachment } from '@/lib/types';
import LinkedText from '@/components/LinkedText';

/** Props du composant TaskDetail */
interface TaskDetailProps {
  /** Tâche actuellement sélectionnée, ou null si le panneau est fermé */
  task: Task | null;
  /** Callback pour fermer le panneau */
  onClose: () => void;
  /** Callback déclenché après une mise à jour réussie de la tâche */
  onUpdate: (task: Task) => void;
}

/**
 * Formate une date ISO en format lisible en français.
 * @param dateStr - Chaîne de date ISO
 * @returns Date formatée en français
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Libellé lisible du statut d'une tâche.
 * @param status - Statut de la tâche
 * @returns Libellé en français
 */
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    todo: 'À faire',
    in_progress: 'En cours',
    done: 'Terminé',
    waiting: 'En attente',
  };
  return labels[status] ?? status;
}

/**
 * Panneau de détail d'une tâche avec édition inline et gestion des pièces jointes.
 */
export default function TaskDetail({ task, onClose, onUpdate }: TaskDetailProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Contrôle le mode lecture/édition de la description
  const [editingDescription, setEditingDescription] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** URL de l'image ouverte en lightbox, null si aucune */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  /** Nom de fichier de l'image ouverte en lightbox */
  const [lightboxAlt, setLightboxAlt] = useState('');

  // Synchronise l'état local quand la tâche sélectionnée change
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setEditingDescription(false);
      setUploadError(null);
      fetchAttachments(task.id);
    }
  }, [task]);

  /**
   * Charge les pièces jointes d'une tâche depuis l'API.
   * @param taskId - Identifiant de la tâche
   */
  async function fetchAttachments(taskId: number): Promise<void> {
    try {
      const response = await fetch(`/api/uploads?task_id=${taskId}`);
      if (!response.ok) throw new Error('Erreur lors du chargement des pièces jointes');
      const data = await response.json() as Attachment[];
      setAttachments(data);
    } catch (err) {
      setAttachments([]);
    }
  }

  /**
   * Sauvegarde les modifications d'un champ via un PATCH vers l'API.
   * Appelée au blur du titre ou de la description.
   * @param field - Nom du champ à mettre à jour
   * @param value - Nouvelle valeur du champ
   */
  async function handleAutoSave(field: 'title' | 'description', value: string): Promise<void> {
    if (!task) return;

    // Pas de sauvegarde si la valeur n'a pas changé
    if (field === 'title' && value === task.title) return;
    if (field === 'description' && value === (task.description ?? '')) return;
    if (field === 'title' && value.trim() === '') return;

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value.trim() }),
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      // L'API retourne maintenant { task, tomorrowSlot, deletedTomorrowSlotId }
      // On ne s'intéresse qu'à la tâche mise à jour ici (titre/description uniquement)
      const { task: updated } = await response.json() as { task: Task; tomorrowSlot: Task | null; deletedTomorrowSlotId: number | null };
      onUpdate(updated);
    } catch (err) {
      // La sauvegarde a échoué  -  on ne modifie pas l'état local
    }
  }

  /**
   * Gère l'upload d'un fichier vers l'API.
   * @param event - Événement de changement du champ fichier
   */
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!task) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('task_id', String(task.id));

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json() as { error: string };
        throw new Error(err.error ?? 'Erreur lors de l\'upload');
      }

      const attachment = await response.json() as Attachment;
      setAttachments((prev) => [...prev, attachment]);
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setIsUploading(false);
      // Réinitialise l'input fichier pour permettre un nouvel upload du même fichier
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  /**
   * Supprime une pièce jointe via l'API.
   * @param attachmentId - Identifiant de la pièce jointe à supprimer
   */
  async function handleDeleteAttachment(attachmentId: number): Promise<void> {
    try {
      const response = await fetch(`/api/uploads/${attachmentId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      // Échec silencieux  -  la pièce jointe reste dans la liste (cohérence UI)
    }
  }

  // Ne rend rien si aucune tâche n'est sélectionnée
  if (!task) return null;

  return (
    <>
      {/* Fond semi-transparent cliquable pour fermer le panneau */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panneau latéral glissant depuis la droite */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col overflow-hidden"
        role="complementary"
        aria-label="Détail de la tâche"
      >
        {/* En-tête du panneau */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Détail de la tâche</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps du panneau avec défilement */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Champ titre éditable */}
          <div>
            <label
              htmlFor="task-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Titre
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleAutoSave('title', title)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Champ description  -  lecture avec liens cliquables, édition au clic */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              {!editingDescription && (
                <button
                  onClick={() => setEditingDescription(true)}
                  className="text-xs text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                >
                  Modifier
                </button>
              )}
            </div>

            {editingDescription ? (
              /* Mode édition  -  textarea standard */
              <textarea
                id="task-description"
                autoFocus
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  handleAutoSave('description', description);
                  setEditingDescription(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDescription(task.description ?? '');
                    setEditingDescription(false);
                  }
                }}
                className="w-full rounded-md border border-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Ajouter une description..."
              />
            ) : (
              /* Mode lecture  -  texte avec liens cliquables, clic pour éditer */
              <div
                onClick={() => setEditingDescription(true)}
                className="min-h-[2.5rem] w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white px-3 py-2 text-sm cursor-text whitespace-pre-wrap"
                title="Cliquer pour modifier"
              >
                {description ? (
                  <LinkedText text={description} />
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 italic">
                    Ajouter une description…
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section pièces jointes */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pièces jointes
            </h3>

            {attachments.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucune pièce jointe</p>
            )}

            {/* Grille de miniatures pour les images */}
            {attachments.some((a) => a.mimetype?.startsWith('image/')) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments
                  .filter((a) => a.mimetype?.startsWith('image/'))
                  .map((attachment) => (
                    <button
                      key={attachment.id}
                      onClick={() => {
                        setLightboxUrl(`/api/uploads/${attachment.id}`);
                        setLightboxAlt(attachment.filename);
                      }}
                      title={attachment.filename}
                      className="relative group block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/uploads/${attachment.id}`}
                        alt={attachment.filename}
                        className="h-20 w-20 object-cover rounded border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                      />
                      {/* Bouton suppression au survol */}
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAttachment(attachment.id);
                        }}
                        className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none hover:bg-red-600"
                        aria-label={`Supprimer ${attachment.filename}`}
                      >
                        ✕
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {/* Liste des fichiers non-image */}
            <ul className="space-y-2 mb-3">
              {attachments
                .filter((a) => !a.mimetype?.startsWith('image/'))
                .map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-3 py-2"
                  >
                    <a
                      href={`/api/uploads/${attachment.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-xs"
                    >
                      📎 {attachment.filename}
                    </a>
                    <button
                      onClick={() => handleDeleteAttachment(attachment.id)}
                      className="ml-2 text-red-500 hover:text-red-700 text-xs shrink-0"
                      aria-label={`Supprimer ${attachment.filename}`}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
            </ul>

            {/* Bouton d'upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <label
                htmlFor="file-upload"
                className={`inline-flex items-center px-3 py-1.5 text-sm rounded border cursor-pointer
                  ${isUploading
                    ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                    : 'border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
              >
                {isUploading ? 'Envoi en cours...' : '+ Ajouter un fichier'}
              </label>

              {uploadError && (
                <p className="mt-1 text-xs text-red-500">{uploadError}</p>
              )}
            </div>
          </div>

          {/* Métadonnées de la tâche */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Informations
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>
                <span className="font-medium">Statut :</span>{' '}
                <span className="capitalize">{statusLabel(task.status)}</span>
              </p>
              <p>
                <span className="font-medium">Source :</span>{' '}
                <span className="capitalize">{task.source}</span>
              </p>
              <p>
                <span className="font-medium">Créée le :</span>{' '}
                {formatDate(task.created_at)}
              </p>
              <p>
                <span className="font-medium">Modifiée le :</span>{' '}
                {formatDate(task.updated_at)}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Lightbox - fond sombre cliquable pour fermer, z-index supérieur au panneau */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
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
    </>
  );
}
