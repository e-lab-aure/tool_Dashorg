'use client';

/**
 * @module RssModal
 * @description Modale de gestion des flux RSS.
 * Permet de consulter les flux suivis, d'en ajouter de nouveaux via une URL,
 * et d'en supprimer. Déclenche un callback onClose pour fermer la modale.
 */

import { useState, useEffect } from 'react';
import type { RssFeed } from '@/lib/types';

/** Props du composant RssModal */
interface RssModalProps {
  /** Callback appelé pour fermer la modale */
  onClose: () => void;
}

/**
 * Modale de gestion des flux RSS.
 * Charge la liste des flux au montage et permet les opérations d'ajout/suppression.
 */
export default function RssModal({ onClose }: RssModalProps) {
  const [feeds, setFeeds] = useState<(RssFeed & { article_count: number })[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  /**
   * Charge la liste des flux depuis l'API.
   */
  async function loadFeeds(): Promise<void> {
    try {
      const res = await fetch('/api/rss/feeds');
      if (!res.ok) return;
      const data = await res.json() as (RssFeed & { article_count: number })[];
      setFeeds(data);
    } catch {
      // Erreur silencieuse
    }
  }

  useEffect(() => {
    loadFeeds();
  }, []);

  /**
   * Ajoute un nouveau flux RSS via l'API.
   */
  async function handleAdd(): Promise<void> {
    const url = urlInput.trim();
    if (!url) return;

    setIsAdding(true);
    setError(null);

    try {
      const res = await fetch('/api/rss/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: nameInput.trim() || undefined }),
      });

      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'ajout');
        return;
      }

      setUrlInput('');
      setNameInput('');
      await loadFeeds();
    } catch {
      setError('Erreur réseau  -  vérifiez votre connexion');
    } finally {
      setIsAdding(false);
    }
  }

  /**
   * Supprime un flux RSS via l'API.
   * @param id - Identifiant du flux à supprimer
   */
  async function handleDelete(id: number): Promise<void> {
    setDeletingId(id);
    try {
      await fetch(`/api/rss/feeds/${id}`, { method: 'DELETE' });
      setFeeds((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // Erreur silencieuse
    } finally {
      setDeletingId(null);
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-white">Flux RSS</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Formulaire d'ajout */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Ajouter un flux
            </label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="https://example.com/feed.xml"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Nom du flux (facultatif  -  détecté automatiquement)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
            <button
              onClick={handleAdd}
              disabled={!urlInput.trim() || isAdding}
              className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isAdding ? 'Ajout en cours...' : 'Ajouter le flux'}
            </button>
          </div>

          {/* Liste des flux */}
          {feeds.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Flux suivis ({feeds.length})
              </label>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {feeds.map((feed) => (
                  <li key={feed.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {feed.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{feed.url}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400 tabular-nums">
                        {feed.article_count} art.
                      </span>
                      <button
                        onClick={() => handleDelete(feed.id)}
                        disabled={deletingId === feed.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                        aria-label={`Supprimer le flux ${feed.name}`}
                      >
                        {deletingId === feed.id ? '...' : 'Supprimer'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {feeds.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-4">
              Aucun flux configuré  -  ajoutez votre premier flux ci-dessus.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
