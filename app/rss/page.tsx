'use client';

/**
 * @module rss/page
 * @description Page dédiée à la lecture des articles RSS.
 * Présentation en liste centrée : image à gauche, titre + date + description à droite.
 * Scroll infini, filtrage par flux, gestion des flux (ajout/suppression) intégrée.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { RssArticle, RssFeed } from '@/lib/types';

const PAGE_SIZE = 20;

/**
 * Formate une date ISO en format relatif lisible.
 * @param iso - Date ISO 8601
 */
function formatDateRelative(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 7) return `il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Page de lecture RSS.
 */
export default function RssPage() {
  const [feeds, setFeeds] = useState<(RssFeed & { article_count: number })[]>([]);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFeedManager, setShowFeedManager] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /** Charge la liste des flux */
  const loadFeeds = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/rss/feeds');
      if (res.ok) setFeeds(await res.json() as (RssFeed & { article_count: number })[]);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  /**
   * Charge une page d'articles (scroll infini).
   */
  const loadArticles = useCallback(async (
    currentOffset: number,
    feedId: number | null,
    reset: boolean
  ): Promise<void> => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ offset: String(currentOffset), limit: String(PAGE_SIZE) });
      if (feedId !== null) params.set('feed_id', String(feedId));
      const res = await fetch(`/api/rss/articles?${params}`);
      if (!res.ok) return;
      const data = await res.json() as RssArticle[];
      setArticles((prev) => {
        if (reset) return data;
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...data.filter((a) => !seen.has(a.id))];
      });
      setHasMore(data.length === PAGE_SIZE);
      setOffset(currentOffset + data.length);
    } catch { /* silencieux */ }
    finally { setIsLoading(false); }
  }, [isLoading]);

  useEffect(() => {
    loadArticles(0, selectedFeedId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedId]);

  /** Scroll infini */
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadArticles(offset, selectedFeedId, false);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, offset, selectedFeedId, loadArticles]);

  function handleFeedChange(feedId: number | null): void {
    setSelectedFeedId(feedId);
    setOffset(0);
    setHasMore(true);
    setArticles([]);
  }

  async function handleArticleClick(article: RssArticle): Promise<void> {
    window.open(article.url, '_blank', 'noopener,noreferrer');
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    try { await fetch(`/api/rss/articles/${article.id}`, { method: 'DELETE' }); }
    catch { /* silencieux */ }
  }

  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetch('/api/rss/refresh', { method: 'POST' });
      setOffset(0);
      setHasMore(true);
      setArticles([]);
      await loadArticles(0, selectedFeedId, true);
    } catch { /* silencieux */ }
    finally { setIsRefreshing(false); }
  }

  async function handleDeleteFeed(id: number): Promise<void> {
    await fetch(`/api/rss/feeds/${id}`, { method: 'DELETE' });
    await loadFeeds();
    // Si le flux supprimé était sélectionné, revient sur "Tous"
    if (selectedFeedId === id) handleFeedChange(null);
    else { setOffset(0); setHasMore(true); setArticles([]); loadArticles(0, selectedFeedId, true); }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">

      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Link
          href="/"
          className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
        >
          ← Retour
        </Link>
        <h1 className="text-lg font-bold tracking-tight flex-1">Flux RSS</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isRefreshing ? 'Rafraîchissement...' : '↻ Rafraîchir'}
        </button>
        <button
          onClick={() => setShowFeedManager((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showFeedManager
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          ⚙ Gérer les flux
        </button>
      </header>

      {/* Panneau de gestion des flux  -  déplié sous le header */}
      {showFeedManager && (
        <FeedManager
          feeds={feeds}
          onDelete={handleDeleteFeed}
          onAdded={async () => { await loadFeeds(); await handleRefresh(); }}
        />
      )}

      {/* Onglets de filtre */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 flex gap-1 overflow-x-auto">
        <TabButton active={selectedFeedId === null} onClick={() => handleFeedChange(null)}>
          Tous
        </TabButton>
        {feeds.map((feed) => (
          <TabButton key={feed.id} active={selectedFeedId === feed.id} onClick={() => handleFeedChange(feed.id)}>
            {feed.name}
          </TabButton>
        ))}
      </div>

      {/* Liste d'articles */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {articles.length === 0 && !isLoading && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-600">
            <p className="text-4xl mb-3">📰</p>
            <p className="text-sm">Aucun article disponible</p>
          </div>
        )}

        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {articles.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              onClick={() => handleArticleClick(article)}
            />
          ))}
        </div>

        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {!hasMore && articles.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-10">
            Tous les articles ont été chargés
          </p>
        )}

        <div ref={sentinelRef} className="h-1" />
      </main>
    </div>
  );
}

/* ─── Composants internes ─────────────────────────────────────────────────── */

/** Onglet de filtre */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

/** Props du panneau de gestion des flux */
interface FeedManagerProps {
  feeds: (RssFeed & { article_count: number })[];
  onDelete: (id: number) => Promise<void>;
  onAdded: () => Promise<void>;
}

/**
 * Panneau inline de gestion des flux RSS.
 * Affiche la liste des flux avec bouton de suppression et un formulaire d'ajout.
 */
function FeedManager({ feeds, onDelete, onAdded }: FeedManagerProps) {
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(): Promise<void> {
    const url = urlInput.trim();
    if (!url || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/rss/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: nameInput.trim() || undefined }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Erreur lors de l\'ajout'); return; }
      setUrlInput('');
      setNameInput('');
      await onAdded();
    } catch {
      setError('Erreur réseau');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  }

  return (
    <div className="bg-blue-50 dark:bg-gray-900 border-b border-blue-100 dark:border-gray-800 px-6 py-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">

        {/* Formulaire d'ajout */}
        <div className="flex gap-2 flex-wrap">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="URL du flux RSS"
            className="flex-1 min-w-48 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Nom (facultatif)"
            className="w-48 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!urlInput.trim() || isAdding}
            className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {isAdding ? 'Ajout...' : '+ Ajouter'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Liste des flux */}
        {feeds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm"
              >
                <span className="text-gray-700 dark:text-gray-300 font-medium">{feed.name}</span>
                <span className="text-gray-400 text-xs">({feed.article_count})</span>
                <button
                  onClick={() => handleDelete(feed.id)}
                  disabled={deletingId === feed.id}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors ml-1 leading-none"
                  aria-label={`Supprimer ${feed.name}`}
                >
                  {deletingId === feed.id ? '...' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}
        {feeds.length === 0 && (
          <p className="text-sm text-gray-400">Aucun flux configuré.</p>
        )}
      </div>
    </div>
  );
}

/** Props de la ligne article */
interface ArticleRowProps {
  article: RssArticle;
  onClick: () => void;
}

/**
 * Ligne d'article RSS.
 * Image à gauche (si disponible), source + titre + date + description à droite.
 * La description est affichée sans troncature pour maximiser la lisibilité.
 */
function ArticleRow({ article, onClick }: ArticleRowProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className="group w-full text-left py-6 flex gap-6 hover:bg-white dark:hover:bg-gray-900 transition-colors rounded-xl px-4 -mx-4"
    >
      {/* Image à gauche */}
      {article.image_url && !imgError ? (
        <div className="flex-shrink-0 w-52 h-36 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-52 h-36 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center">
          <span className="text-4xl opacity-20">📰</span>
        </div>
      )}

      {/* Contenu */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Source + date */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {article.feed_name}
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {formatDateRelative(article.published_at ?? article.created_at)}
          </span>
          <span className="ml-auto text-sm text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Lire →
          </span>
        </div>

        {/* Titre */}
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {article.title}
        </h2>

        {/* Description  -  sans limite de lignes pour maximiser la lecture */}
        {article.description && (
          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
            {article.description}
          </p>
        )}
      </div>
    </button>
  );
}
