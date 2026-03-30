'use client';

/**
 * @module ListPanel
 * @description Panneau de gestion des listes personnelles.
 * Affiche un onglet par catégorie (dynamiques, chargées depuis la DB) avec :
 * - création de nouvelles listes avec tag IMAP personnalisé
 * - ajout inline d'items, édition inline au clic sur le titre
 * - gestion des statuts fait/non-fait avec choix suppression ou archivage
 * - section archives repliable par catégorie
 * - popup ℹ avec recherche temps réel listant toutes les listes et leurs tags
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ListItem, ListItemImage, ListCategory } from '@/lib/types';
import EmojiPickerButton from '@/components/EmojiPickerButton';
import LinkedText from '@/components/LinkedText';

/** Props du composant ListPanel */
interface ListPanelProps {
  items: ListItem[];
  onAdd: (item: ListItem) => void;
  onUpdate: (item: ListItem) => void;
  onDelete: (itemId: number) => void;
  /** Callback déclenché après un réordonnancement : reçoit les items mis à jour avec leurs nouvelles positions */
  onReorder: (items: ListItem[]) => void;
}

/** Props du composant ImageThumbnails */
interface ImageThumbnailsProps {
  images: ListItemImage[];
  itemId: number;
}

/**
 * Affiche les miniatures des images avec un popup intégré au clic.
 * Un second clic sur la même miniature (ou sur le fond sombre) ferme le popup.
 * @param images - Liste des images de l'item
 * @param itemId - Identifiant de l'item parent
 */
function ImageThumbnails({ images, itemId }: ImageThumbnailsProps) {
  const [openId, setOpenId] = useState<number | null>(null);

  /** Bascule le popup : ouvre l'image cliquée, ferme si déjà ouverte. */
  const handleThumbnailClick = useCallback((imgId: number) => {
    setOpenId((prev) => (prev === imgId ? null : imgId));
  }, []);

  const openImage = images.find((img) => img.id === openId);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => handleThumbnailClick(img.id)}
            title={img.filename}
            className={`w-12 h-12 rounded overflow-hidden border-2 transition-colors shrink-0 ${
              openId === img.id
                ? 'border-blue-500'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/lists/${itemId}/images/${img.id}`}
              alt={img.filename}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Popup lightbox  -  fond sombre cliquable pour fermer */}
      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setOpenId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={openImage.filename}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/lists/${itemId}/images/${openImage.id}`}
            alt={openImage.filename}
            className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpenId(null)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors flex items-center justify-center text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Composant de panneau de listes avec onglets dynamiques, édition inline, archivage,
 * création de nouvelles listes et popup d'informations avec recherche.
 */
export default function ListPanel({ items, onAdd, onUpdate, onDelete, onReorder }: ListPanelProps) {
  // Catégories chargées depuis l'API
  const [categories, setCategories] = useState<ListCategory[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');

  // État du formulaire d'ajout d'item
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  // État de l'édition inline d'un onglet (nom + icône)
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');

  // État du formulaire de création de nouvelle liste
  const [showNewListForm, setShowNewListForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListTagKey, setNewListTagKey] = useState('');
  const [newListIcon, setNewListIcon] = useState('📋');
  const [newListError, setNewListError] = useState<string | null>(null);

  // État de la popup ℹ avec recherche
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [infoSearch, setInfoSearch] = useState('');
  const infoSearchRef = useRef<HTMLInputElement>(null);

  // État du drag & drop pour le réordonnancement des items
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // État de l'édition inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  /**
   * Charge les catégories depuis l'API au montage du composant.
   */
  useEffect(() => {
    async function loadCategories(): Promise<void> {
      try {
        const response = await fetch('/api/list-categories');
        if (!response.ok) throw new Error('Erreur chargement catégories');
        const data = await response.json() as ListCategory[];
        setCategories(data);
        if (data.length > 0) setActiveTab(data[0].category);
      } catch (err) {
        }
    }
    loadCategories();
  }, []);

  /**
   * Met le focus sur le champ de recherche à l'ouverture de la popup ℹ.
   */
  useEffect(() => {
    if (showInfoPopup) {
      setTimeout(() => infoSearchRef.current?.focus(), 50);
    } else {
      setInfoSearch('');
    }
  }, [showInfoPopup]);

  // Catégorie active courante
  const activeCat = categories.find((c) => c.category === activeTab);

  // Filtre les items de l'onglet actif selon leur statut
  const activeItems = items.filter(
    (item) => item.category === activeTab && item.archived === 0
  );
  const archivedItems = items.filter(
    (item) => item.category === activeTab && item.archived === 1
  );

  // Catégories filtrées pour la popup ℹ (recherche temps réel)
  const filteredCategories = infoSearch.trim()
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(infoSearch.toLowerCase()) ||
          c.tag.toLowerCase().includes(infoSearch.toLowerCase()) ||
          c.category.toLowerCase().includes(infoSearch.toLowerCase())
      )
    : categories;

  // Dérive le tag affiché depuis la saisie de l'utilisateur (aperçu temps réel)
  const tagKeyPreview = newListTagKey
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const tagPreview = tagKeyPreview ? `[${tagKeyPreview}]` : '';

  /**
   * Démarre l'édition inline d'un item.
   * @param item - Item à éditer
   */
  function handleStartEdit(item: ListItem): void {
    if (item.done || item.archived) return;
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description ?? '');
  }

  /**
   * Annule l'édition en cours sans sauvegarder.
   */
  function handleCancelEdit(): void {
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
  }

  /**
   * Sauvegarde les modifications de l'item en cours d'édition via l'API.
   * @param item - Item d'origine, pour détecter les changements
   */
  async function handleSaveEdit(item: ListItem): Promise<void> {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      handleCancelEdit();
      return;
    }

    if (trimmedTitle === item.title && editDescription.trim() === (item.description ?? '')) {
      handleCancelEdit();
      return;
    }

    try {
      const response = await fetch(`/api/lists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: editDescription.trim() || null,
        }),
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch (err) {
    } finally {
      handleCancelEdit();
    }
  }

  /**
   * Bascule le statut fait/non-fait d'un item.
   * @param item - Item à basculer
   */
  async function handleToggleDone(item: ListItem): Promise<void> {
    if (editingId === item.id) handleCancelEdit();

    try {
      const response = await fetch(`/api/lists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: item.done ? 0 : 1 }),
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour');

      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch (err) {
    }
  }

  /**
   * Archive un item coché (done=1).
   * @param itemId - Identifiant de l'item à archiver
   */
  async function handleArchive(itemId: number): Promise<void> {
    try {
      const response = await fetch(`/api/lists/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 1 }),
      });

      if (!response.ok) throw new Error('Erreur lors de l\'archivage');

      const updated = await response.json() as ListItem;
      onUpdate(updated);
      setShowArchive(true);
    } catch (err) {
    }
  }

  /**
   * Restaure un item archivé dans la liste active.
   * @param itemId - Identifiant de l'item à restaurer
   */
  async function handleRestore(itemId: number): Promise<void> {
    try {
      const response = await fetch(`/api/lists/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 0, done: 0 }),
      });

      if (!response.ok) throw new Error('Erreur lors de la restauration');

      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch (err) {
    }
  }

  /**
   * Supprime définitivement un item via l'API.
   * @param itemId - Identifiant de l'item à supprimer
   */
  async function handleDelete(itemId: number): Promise<void> {
    try {
      const response = await fetch(`/api/lists/${itemId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      onDelete(itemId);
    } catch (err) {
    }
  }

  /**
   * Soumet le formulaire d'ajout d'un nouvel item dans la catégorie active.
   */
  async function handleAdd(): Promise<void> {
    if (!newTitle.trim()) return;

    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeTab,
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
        }),
      });

      if (!response.ok) throw new Error('Erreur lors de la création');

      const item = await response.json() as ListItem;
      onAdd(item);
      setNewTitle('');
      setNewDescription('');
      setShowForm(false);
    } catch (err) {
    }
  }

  /**
   * Crée une nouvelle catégorie de liste via l'API.
   */
  async function handleCreateList(): Promise<void> {
    setNewListError(null);

    if (!newListName.trim()) {
      setNewListError('Le nom est obligatoire');
      return;
    }

    if (!newListTagKey.trim()) {
      setNewListError('Le tag est obligatoire');
      return;
    }

    try {
      const response = await fetch('/api/list-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newListName.trim(),
          category: newListTagKey.trim(),
          tag: tagKeyPreview,
          icon: newListIcon.trim() || '📋',
        }),
      });

      if (!response.ok) {
        const { error } = await response.json() as { error: string };
        setNewListError(error);
        return;
      }

      const created = await response.json() as ListCategory;
      setCategories((prev) => [...prev, created]);
      setActiveTab(created.category);
      setNewListName('');
      setNewListTagKey('');
      setNewListIcon('📋');
      setShowNewListForm(false);
    } catch (err) {
      setNewListError('Erreur lors de la création');
    }
  }

  /**
   * Supprime une catégorie via l'API après confirmation.
   * @param cat - Catégorie à supprimer
   */
  async function handleDeleteCategory(cat: ListCategory): Promise<void> {
    try {
      const response = await fetch(`/api/list-categories/${cat.id}`, { method: 'DELETE' });

      if (!response.ok) {
        const { error } = await response.json() as { error: string };
        alert(error);
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      if (activeTab === cat.category) {
        const remaining = categories.filter((c) => c.id !== cat.id);
        setActiveTab(remaining[0]?.category ?? '');
      }
    } catch (err) {
    }
  }

  /**
   * Ordre d'affichage des items actifs calculé en temps réel pendant le drag.
   * Déplace visuellement l'item glissé à la position de l'item survolé sans toucher l'état.
   */
  const displayItems = useMemo<ListItem[]>(() => {
    if (!draggedId || !dragOverId || draggedId === dragOverId) return activeItems;
    const result = [...activeItems];
    const fromIdx = result.findIndex((i) => i.id === draggedId);
    const toIdx = result.findIndex((i) => i.id === dragOverId);
    if (fromIdx === -1 || toIdx === -1) return activeItems;
    const [moved] = result.splice(fromIdx, 1);
    result.splice(toIdx, 0, moved);
    return result;
  }, [activeItems, draggedId, dragOverId]);

  /**
   * Finalise le réordonnancement après un drop réussi.
   * Envoie les IDs dans le nouvel ordre à l'API et notifie le parent.
   * @param targetId - ID de l'item sur lequel le drag s'est terminé
   */
  async function handleDropOnItem(targetId: number): Promise<void> {
    if (!draggedId || draggedId === targetId) return;

    const reordered = [...activeItems];
    const fromIdx = reordered.findIndex((i) => i.id === draggedId);
    const toIdx = reordered.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setDraggedId(null);
    setDragOverId(null);

    try {
      const response = await fetch('/api/lists/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map((i) => i.id) }),
      });

      if (!response.ok) throw new Error('Erreur lors du réordonnancement');

      const updated = await response.json() as ListItem[];
      onReorder(updated);
    } catch (err) {
    }
  }

  /**
   * Démarre l'édition inline d'un onglet de catégorie.
   * @param cat - Catégorie à éditer
   */
  function handleStartEditCat(cat: ListCategory): void {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatIcon(cat.icon);
  }

  /** Annule l'édition de catégorie sans sauvegarder. */
  function handleCancelEditCat(): void {
    setEditingCatId(null);
    setEditCatName('');
    setEditCatIcon('');
  }

  /**
   * Sauvegarde les modifications d'une catégorie via l'API.
   * @param cat - Catégorie d'origine
   */
  async function handleSaveEditCat(cat: ListCategory): Promise<void> {
    const trimmedName = editCatName.trim();
    if (!trimmedName) {
      handleCancelEditCat();
      return;
    }

    if (trimmedName === cat.name && editCatIcon === cat.icon) {
      handleCancelEditCat();
      return;
    }

    try {
      const response = await fetch(`/api/list-categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, icon: editCatIcon }),
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      const updated = await response.json() as ListCategory;
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
    } finally {
      handleCancelEditCat();
    }
  }

  if (categories.length === 0) {
    return (
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Chargement des listes…</p>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">

      {/* En-tête avec titre et bouton ℹ */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Mes listes</h2>

        {/* Bouton ℹ  -  ouvre la popup de référence des tags par clic */}
        <button
          onClick={() => setShowInfoPopup(true)}
          className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 dark:text-blue-400 text-xs font-bold flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
          aria-label="Voir toutes les listes et leurs tags email"
          title="Voir toutes les listes et leurs tags email"
        >
          ℹ
        </button>
      </div>

      {/* Popup ℹ  -  liste toutes les catégories avec leur tag, recherche temps réel */}
      {showInfoPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowInfoPopup(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Référence des tags email"
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête de la popup */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Tags email par liste
              </h3>
              <button
                onClick={() => setShowInfoPopup(false)}
                className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center justify-center text-sm transition-colors"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            {/* Champ de recherche temps réel */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
              <input
                ref={infoSearchRef}
                type="text"
                value={infoSearch}
                onChange={(e) => setInfoSearch(e.target.value)}
                placeholder="Rechercher une liste ou un tag…"
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            {/* Instructions d'envoi */}
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Envoyez un email à votre adresse configurée avec le tag au début du sujet.
                Le corps du message devient la description, les images en PJ sont affichées.
              </p>
            </div>

            {/* Liste des catégories */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
              {filteredCategories.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
                  Aucun résultat
                </li>
              ) : (
                filteredCategories.map((cat) => (
                  <li key={cat.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {cat.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Objet du mail :{' '}
                        <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">
                          {cat.tag} Titre de l&apos;item
                        </span>
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>

            {/* Pied de popup */}
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-right">
              <button
                onClick={() => setShowInfoPopup(false)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets de catégories + bouton nouvelle liste */}
      <div className="flex gap-1 mb-1 border-b border-gray-200 dark:border-gray-700 flex-wrap">
        {categories.map((cat) => {
          // Mode édition inline de l'onglet
          if (editingCatId === cat.id) {
            return (
              <div
                key={cat.category}
                className="flex items-center gap-1 px-2 py-1 rounded-t-md bg-blue-500"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Sélecteur d'emoji  -  le clic ne doit pas fermer l'édition */}
                <EmojiPickerButton value={editCatIcon} onChange={setEditCatIcon} />

                {/* Champ nom  -  pas de onBlur pour éviter la fermeture lors du clic sur le picker */}
                <input
                  type="text"
                  autoFocus
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEditCat(cat);
                    if (e.key === 'Escape') handleCancelEditCat();
                  }}
                  className="w-28 text-sm rounded border border-blue-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />

                {/* Bouton valider */}
                <button
                  onMouseDown={(e) => { e.preventDefault(); handleSaveEditCat(cat); }}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white/20 hover:bg-white/40 text-white text-sm transition-colors shrink-0"
                  title="Valider"
                >
                  ✓
                </button>

                {/* Bouton annuler */}
                <button
                  onMouseDown={(e) => { e.preventDefault(); handleCancelEditCat(); }}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white/20 hover:bg-white/40 text-white text-sm transition-colors shrink-0"
                  title="Annuler"
                >
                  ✕
                </button>
              </div>
            );
          }

          // Mode affichage normal  -  double-clic pour éditer
          return (
            <button
              key={cat.category}
              onClick={() => {
                setActiveTab(cat.category);
                setShowForm(false);
                setShowArchive(false);
                handleCancelEdit();
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                setActiveTab(cat.category);
                handleStartEditCat(cat);
              }}
              className={`px-3 py-2 text-sm font-medium rounded-t-md transition-colors select-none ${
                activeTab === cat.category
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Double-cliquer pour renommer"
            >
              {cat.icon} {cat.name}
              <span className="ml-1 text-xs opacity-75">
                ({items.filter((i) => i.category === cat.category && i.archived === 0).length})
              </span>
            </button>
          );
        })}

        {/* Bouton pour créer une nouvelle liste */}
        <button
          onClick={() => {
            setShowNewListForm((prev) => !prev);
            setNewListError(null);
          }}
          className="px-3 py-2 text-sm font-medium rounded-t-md text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Créer une nouvelle liste"
        >
          + Liste
        </button>
      </div>

      {/* Tag de la liste active affiché sous les onglets */}
      {activeCat && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Tag email :{' '}
          <span className="font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
            {activeCat.tag}
          </span>
        </p>
      )}

      {/* Formulaire de création d'une nouvelle liste */}
      {showNewListForm && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 space-y-2">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Nouvelle liste
          </p>

          {/* Nom d'affichage */}
          <input
            type="text"
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateList();
              if (e.key === 'Escape') setShowNewListForm(false);
            }}
            placeholder="Nom affiché (ex : Séries TV)"
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Tag IMAP */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newListTagKey}
              onChange={(e) => setNewListTagKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateList();
                if (e.key === 'Escape') setShowNewListForm(false);
              }}
              placeholder="Tag (ex : serie)"
              className="flex-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {/* Aperçu du tag généré */}
            {tagPreview && (
              <span className="shrink-0 font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700">
                {tagPreview}
              </span>
            )}
          </div>

          {/* Icône  -  sélecteur d'emoji */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Icône :</span>
            <EmojiPickerButton value={newListIcon} onChange={setNewListIcon} />
          </div>

          {/* Message d'erreur */}
          {newListError && (
            <p className="text-xs text-red-500 dark:text-red-400">{newListError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreateList}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Créer
            </button>
            <button
              onClick={() => {
                setShowNewListForm(false);
                setNewListName('');
                setNewListTagKey('');
                setNewListIcon('📋');
                setNewListError(null);
              }}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste des items actifs de la catégorie */}
      <ul className="space-y-2 mb-4">
        {activeItems.length === 0 && (
          <li className="text-sm text-gray-400 dark:text-gray-500 italic py-2">
            Aucun item dans cette liste
          </li>
        )}

        {displayItems.map((item) => (
          <li
            key={item.id}
            draggable={!item.done && editingId !== item.id}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }}
            onDrop={(e) => { e.preventDefault(); handleDropOnItem(item.id); }}
            onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
            className={[
              'flex items-start gap-3 p-3 rounded-lg transition-colors',
              item.done ? 'bg-gray-50 dark:bg-gray-700/40 opacity-70' : 'bg-gray-50 dark:bg-gray-700',
              draggedId === item.id ? 'opacity-40' : '',
              dragOverId === item.id && draggedId !== item.id
                ? 'ring-2 ring-blue-400 dark:ring-blue-500'
                : '',
              !item.done && editingId !== item.id ? 'cursor-grab active:cursor-grabbing' : '',
            ].filter(Boolean).join(' ')}
          >
            {/* Bouton fait/non-fait */}
            <button
              onClick={() => handleToggleDone(item)}
              className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                item.done
                  ? 'border-green-500 bg-green-500 text-white'
                  : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
              }`}
              aria-label={item.done ? 'Marquer comme non fait' : 'Marquer comme fait'}
            >
              {item.done ? '✓' : ''}
            </button>

            {/* Contenu de l'item  -  édition inline au clic sur le titre */}
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(item);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    onBlur={() => handleSaveEdit(item)}
                    className="w-full text-sm rounded border border-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(item);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    placeholder="Description (optionnelle)..."
                    className="w-full text-xs rounded border border-blue-300 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  {item.images && item.images.length > 0 && (
                    <ImageThumbnails images={item.images} itemId={item.id} />
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Entrée pour sauvegarder · Échap pour annuler
                  </p>
                </div>
              ) : (
                <div>
                  <p
                    onClick={() => handleStartEdit(item)}
                    className={`text-sm font-medium ${
                      item.done
                        ? 'line-through text-gray-400 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
                    }`}
                    title={item.done ? undefined : 'Cliquer pour modifier'}
                  >
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <LinkedText text={item.description} />
                    </p>
                  )}
                  {item.images && item.images.length > 0 && (
                    <ImageThumbnails images={item.images} itemId={item.id} />
                  )}
                </div>
              )}
            </div>

            {/* Badge source IMAP */}
            {item.source === 'imap' && (
              <span className="shrink-0 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded">
                email
              </span>
            )}

            {/* Actions : 🗑️ + 📦 si coché, ✕ sinon */}
            {item.done ? (
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => handleArchive(item.id)}
                  className="p-1 text-gray-400 hover:text-amber-500 dark:text-gray-500 dark:hover:text-amber-400 transition-colors"
                  aria-label={`Archiver : ${item.title}`}
                  title="Archiver"
                >
                  📦
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                  aria-label={`Supprimer : ${item.title}`}
                  title="Supprimer définitivement"
                >
                  🗑️
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleDelete(item.id)}
                className="shrink-0 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-sm"
                aria-label={`Supprimer : ${item.title}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Formulaire d'ajout inline */}
      {showForm ? (
        <div className="space-y-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 mb-4">
          <input
            type="text"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setShowForm(false);
                setNewTitle('');
                setNewDescription('');
              }
            }}
            placeholder="Titre..."
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setShowForm(false);
                setNewTitle('');
                setNewDescription('');
              }
            }}
            placeholder="Description (optionnelle)..."
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Ajouter
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setNewTitle('');
                setNewDescription('');
              }}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-4 block"
        >
          + Ajouter un item
        </button>
      )}

      {/* Option suppression de la liste (uniquement si vide) */}
      {activeCat && items.filter((i) => i.category === activeTab && i.archived === 0).length === 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
          <button
            onClick={() => {
              if (confirm(`Supprimer la liste "${activeCat.name}" ?`)) {
                handleDeleteCategory(activeCat);
              }
            }}
            className="text-xs text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
          >
            Supprimer cette liste
          </button>
        </div>
      )}

      {/* Section archives de la catégorie active */}
      {archivedItems.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <button
            onClick={() => setShowArchive((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors w-full text-left"
          >
            <span>{showArchive ? '▾' : '▸'}</span>
            <span>Archives ({archivedItems.length})</span>
          </button>

          {showArchive && (
            <ul className="mt-2 space-y-1">
              {archivedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500 line-through truncate">
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-600">
                        <LinkedText text={item.description} />
                      </p>
                    )}
                    {item.images && item.images.length > 0 && (
                      <ImageThumbnails images={item.images} itemId={item.id} />
                    )}
                  </div>

                  <button
                    onClick={() => handleRestore(item.id)}
                    className="shrink-0 text-xs text-gray-400 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400 transition-colors"
                    aria-label={`Restaurer : ${item.title}`}
                    title="Restaurer dans la liste"
                  >
                    ↩
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="shrink-0 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-xs transition-colors"
                    aria-label={`Supprimer définitivement : ${item.title}`}
                    title="Supprimer définitivement"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
