'use client';

/**
 * @module ListItemDetail
 * @description Panneau latéral glissant (slide-in depuis la droite) pour afficher
 * et éditer le détail d'un item de liste, incluant ses fichiers attachés.
 * Ouvert par double-clic (desktop) ou appui long (mobile).
 * Les modifications de titre et de description sont sauvegardées automatiquement au blur.
 */

import { useState, useEffect, useRef } from 'react';
import type { ListItem, ListItemImage, ListCategory } from '@/lib/types';
import LinkedText from '@/components/LinkedText';

interface ListItemDetailProps {
  item: ListItem | null;
  /** Catégorie de l'item, pour l'affichage dans le panneau */
  category: ListCategory | undefined;
  onClose: () => void;
  onUpdate: (item: ListItem) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ListItemDetail({ item, category, onClose, onUpdate }: ListItemDetailProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [images, setImages] = useState<ListItemImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

  // Synchronise l'état local quand l'item sélectionné change
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description ?? '');
      setEditingDescription(false);
      setUploadError(null);
      fetchImages(item.id);
    }
  }, [item]);

  // Ferme le panneau avec la touche Échap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !editingDescription) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, editingDescription]);

  async function fetchImages(itemId: number): Promise<void> {
    try {
      // Les images sont déjà dans item.images si peuplées par l'API
      // On fait quand même un fetch pour avoir la liste à jour
      const res = await fetch(`/api/lists/${itemId}`);
      if (res.ok) {
        const data = await res.json() as ListItem;
        setImages(data.images ?? []);
      }
    } catch {
      setImages(item?.images ?? []);
    }
  }

  async function handleAutoSave(field: 'title' | 'description', value: string): Promise<void> {
    if (!item) return;
    if (field === 'title' && (value === item.title || value.trim() === '')) return;
    if (field === 'description' && value === (item.description ?? '')) return;

    try {
      const res = await fetch(`/api/lists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value.trim() || null }),
      });
      if (!res.ok) throw new Error('Erreur sauvegarde');
      const updated = await res.json() as ListItem;
      onUpdate(updated);
    } catch { /* silence */ }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!item) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/lists/${item.id}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Erreur lors de l'upload");
      }

      const image = await res.json() as ListItemImage;
      setImages((prev) => [...prev, image]);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteImage(imageId: number): Promise<void> {
    if (!item) return;
    try {
      const res = await fetch(`/api/lists/${item.id}/images/${imageId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur suppression');
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch { /* silence */ }
  }

  if (!item) return null;

  return (
    <>
      {/* Fond semi-transparent */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panneau latéral */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col overflow-hidden"
        role="complementary"
        aria-label="Détail de l'item"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {category && <span className="text-xl">{category.icon}</span>}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {category ? category.name : 'Item'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Titre */}
          <div>
            <label
              htmlFor="list-item-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Titre
            </label>
            <input
              id="list-item-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleAutoSave('title', title)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setTitle(item.title); (e.target as HTMLInputElement).blur(); }
              }}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
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
              <textarea
                autoFocus
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  handleAutoSave('description', description);
                  setEditingDescription(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDescription(item.description ?? '');
                    setEditingDescription(false);
                  }
                }}
                className="w-full rounded-md border border-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Ajouter une description..."
              />
            ) : (
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

          {/* Fichiers attachés */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fichiers
            </h3>

            {images.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic mb-2">
                Aucun fichier attaché
              </p>
            )}

            {/* Grille de miniatures pour les images */}
            {images.some((img) => img.mimetype?.startsWith('image/')) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {images
                  .filter((img) => img.mimetype?.startsWith('image/'))
                  .map((img) => (
                    <button
                      key={img.id}
                      onClick={() => {
                        setLightboxUrl(`/api/lists/${item.id}/images/${img.id}`);
                        setLightboxAlt(img.filename);
                      }}
                      title={img.filename}
                      className="relative group block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/lists/${item.id}/images/${img.id}`}
                        alt={img.filename}
                        className="h-20 w-20 object-cover rounded border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                      />
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(img.id);
                        }}
                        className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none hover:bg-red-600"
                        aria-label={`Supprimer ${img.filename}`}
                      >
                        ✕
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {/* Liste des fichiers non-image */}
            <ul className="space-y-2 mb-3">
              {images
                .filter((img) => !img.mimetype?.startsWith('image/'))
                .map((img) => (
                  <li
                    key={img.id}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-3 py-2"
                  >
                    <a
                      href={`/api/lists/${item.id}/images/${img.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-xs"
                    >
                      📎 {img.filename}
                    </a>
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      className="ml-2 text-red-500 hover:text-red-700 text-xs shrink-0"
                      aria-label={`Supprimer ${img.filename}`}
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
                id="list-file-upload"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <label
                htmlFor="list-file-upload"
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

          {/* Métadonnées */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Informations
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>
                <span className="font-medium">Statut :</span>{' '}
                {item.done ? 'Fait ✓' : 'À faire'}
              </p>
              <p>
                <span className="font-medium">Source :</span>{' '}
                <span className="capitalize">{item.source}</span>
              </p>
              <p>
                <span className="font-medium">Ajouté le :</span>{' '}
                {formatDate(item.created_at)}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Lightbox */}
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
