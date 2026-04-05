'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { ListItem, ListCategory } from '@/lib/types';
import LinkedText from '@/components/LinkedText';
import ImageThumbnails from '@/components/ImageThumbnails';
import ListItemDetail from '@/components/ListItemDetail';

interface GlobalListViewProps {
  items: ListItem[];
  categories: ListCategory[];
  onUpdate: (item: ListItem) => void;
  onDelete: (itemId: number) => void;
}

/**
 * Surligne la première occurrence de `query` dans `text`.
 */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/50 rounded px-0.5 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Vue globale des listes : affiche tous les items actifs en liste plate
 * avec recherche transversale (titre, description, extra_data, nom de catégorie)
 * et filtres par catégorie.
 */
export default function GlobalListView({ items, categories, onUpdate, onDelete }: GlobalListViewProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.category))
  );

  // État d'édition inline local
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Panneau de détail d'item
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);

  // Autofocus sur la barre de recherche à l'ouverture
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // Synchronise les nouvelles catégories créées pendant la session
  useEffect(() => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      categories.forEach((c) => { if (!next.has(c.category)) next.add(c.category); });
      return next;
    });
  }, [categories]);

  // Map catégorie → objet pour les badges et la recherche par nom
  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.category, c])),
    [categories]
  );

  function handleStartEdit(item: ListItem): void {
    if (item.done || item.archived) return;
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description ?? '');
  }

  function handleCancelEdit(): void {
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
  }

  async function handleSaveEdit(item: ListItem): Promise<void> {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) { handleCancelEdit(); return; }
    if (trimmedTitle === item.title && editDescription.trim() === (item.description ?? '')) {
      handleCancelEdit();
      return;
    }
    try {
      const response = await fetch(`/api/lists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, description: editDescription.trim() || null }),
      });
      if (!response.ok) throw new Error('Erreur sauvegarde');
      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch { /* silence */ } finally {
      handleCancelEdit();
    }
  }

  async function handleToggleDone(item: ListItem): Promise<void> {
    if (editingId === item.id) handleCancelEdit();
    try {
      const response = await fetch(`/api/lists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: item.done ? 0 : 1 }),
      });
      if (!response.ok) throw new Error('Erreur mise à jour');
      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch { /* silence */ }
  }

  async function handleArchive(itemId: number): Promise<void> {
    try {
      const response = await fetch(`/api/lists/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 1 }),
      });
      if (!response.ok) throw new Error('Erreur archivage');
      const updated = await response.json() as ListItem;
      onUpdate(updated);
    } catch { /* silence */ }
  }

  async function handleDelete(itemId: number): Promise<void> {
    try {
      const response = await fetch(`/api/lists/${itemId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur suppression');
      onDelete(itemId);
    } catch { /* silence */ }
  }

  const q = searchQuery.trim().toLowerCase();

  /**
   * Items actifs filtrés par catégories actives et par la requête.
   * Si la requête correspond au nom d'une catégorie, tous les items
   * de cette catégorie sont inclus (même sans correspondance sur le titre).
   */
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.archived !== 0) return false;
      if (!enabledCategories.has(item.category)) return false;
      if (!q) return true;

      // Correspondance directe sur le contenu de l'item
      if (
        item.title.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        (item.extra_data?.toLowerCase().includes(q) ?? false)
      ) return true;

      // Correspondance sur le nom ou la clé de catégorie → inclut tous ses items
      const cat = catMap.get(item.category);
      return (
        (cat?.name.toLowerCase().includes(q) ?? false) ||
        (cat?.category.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, enabledCategories, q, catMap]);

  const allSelected = enabledCategories.size === categories.length;

  return (
    <div>
      {/* Barre de recherche */}
      <div className="mb-3">
        <input
          ref={searchRef}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par titre, description ou nom de liste..."
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600
                     bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                     px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500
                     placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Filtres catégories */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40">
        {categories.map((cat) => {
          const count = items.filter(
            (i) => i.category === cat.category && i.archived === 0
          ).length;
          const isEnabled = enabledCategories.has(cat.category);
          return (
            <button
              key={cat.category}
              type="button"
              onClick={() => {
                setEnabledCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat.category)) next.delete(cat.category);
                  else next.add(cat.category);
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm
                          select-none transition-colors border
                          ${isEnabled
                            ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white'
                            : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              <span className="text-xs opacity-60">({count})</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setEnabledCategories(
              allSelected
                ? new Set()
                : new Set(categories.map((c) => c.category))
            )
          }
          className="px-2 py-1 text-xs text-indigo-500 dark:text-indigo-400 hover:underline ml-1"
        >
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>

      {/* Liste plate de tous les items */}
      {filteredItems.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4 text-center">
          {q
            ? `Aucun résultat pour « ${searchQuery} »`
            : 'Aucun item dans les listes sélectionnées'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filteredItems.map((item) => {
            const cat = catMap.get(item.category);
            return (
              <li
                key={item.id}
                onDoubleClick={() => { if (editingId === item.id) handleCancelEdit(); setSelectedItem(item); }}
                className={[
                  'flex items-start gap-3 p-3 rounded-lg transition-colors',
                  item.done
                    ? 'bg-gray-50 dark:bg-gray-700/40 opacity-70'
                    : 'bg-gray-50 dark:bg-gray-700',
                ].join(' ')}
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

                {/* Contenu */}
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
                        {highlight(item.title, searchQuery.trim())}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {q && item.description.toLowerCase().includes(q)
                            ? highlight(item.description, searchQuery.trim())
                            : <LinkedText text={item.description} />}
                        </p>
                      )}
                      {item.images && item.images.length > 0 && (
                        <ImageThumbnails images={item.images} itemId={item.id} />
                      )}
                    </div>
                  )}
                </div>

                {/* Badge catégorie */}
                {cat && (
                  <span
                    className="shrink-0 text-xs text-gray-400 dark:text-gray-500 mt-0.5"
                    title={cat.name}
                  >
                    {cat.icon}
                  </span>
                )}

                {/* Badge source IMAP */}
                {item.source === 'imap' && (
                  <span className="shrink-0 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded">
                    email
                  </span>
                )}

                {/* Actions */}
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
            );
          })}
        </ul>
      )}

      <ListItemDetail
        item={selectedItem}
        category={catMap.get(selectedItem?.category ?? '')}
        onClose={() => setSelectedItem(null)}
        onUpdate={(updated) => { onUpdate(updated); setSelectedItem(updated); }}
      />
    </div>
  );
}
