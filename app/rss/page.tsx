'use client';

/**
 * @module rss/page
 * @description Page dédiée à la lecture des articles RSS.
 * Affiche tous les articles en grille avec image, description et source.
 * Scroll infini : charge 20 articles supplémentaires au bas de page.
 * Filtrage par flux via des onglets.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { RssArticle, RssFeed } from '@/lib/types';

const PAGE_SIZE = 20;

/**
 * Formate une date ISO en format relatif court (ex : "il y a 2h", "27 mars").
 * @param iso - Chaîne de date ISO 8601
 */
function formatDateRelative(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 60) return `il y a ${minutes}min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 7) return `il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Page de lecture RSS — grille de cards avec scroll infini.
 */
export default function RssPage() {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /** Charge la liste des flux pour les onglets de filtre */
  useEffect(() => {
    fetch('/api/rss/feeds')
      .then((r) => r.json())
      .then((data: RssFeed[]) => setFeeds(data))
      .catch(() => {});
  }, []);

  /**
   * Charge une page d'articles et les ajoute à la liste.
   * @param currentOffset - Position de départ dans la liste
   * @param feedId - Identifiant du flux filtré, null pour tous
   * @param reset - Si true, remplace la liste existante (changement de filtre)
   */
  const loadArticles = useCallback(async (
    currentOffset: number,
    feedId: number | null,
    reset: boolean
  ): Promise<void> => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        offset: String(currentOffset),
        limit: String(PAGE_SIZE),
      });
      if (feedId !== null) params.set('feed_id', String(feedId));

      const res = await fetch(`/api/rss/articles?${params}`);
      if (!res.ok) return;

      const data = await res.json() as RssArticle[];

      setArticles((prev) => reset ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setOffset(currentOffset + data.length);
    } catch {
      // Erreur silencieuse
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  /** Chargement initial */
  useEffect(() => {
    loadArticles(0, selectedFeedId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedId]);

  /** Scroll infini via IntersectionObserver sur le sentinel */
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadArticles(offset, selectedFeedId, false);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, offset, selectedFeedId, loadArticles]);

  /**
   * Change le filtre actif et recharge depuis le début.
   * @param feedId - Identifiant du flux ou null pour "Tous"
   */
  function handleFeedChange(feedId: number | null): void {
    setSelectedFeedId(feedId);
    setOffset(0);
    setHasMore(true);
    setArticles([]);
  }

  /**
   * Marque un article comme lu (suppression) et ouvre le lien.
   * @param article - Article cliqué
   */
  async function handleArticleClick(article: RssArticle): Promise<void> {
    window.open(article.url, '_blank', 'noopener,noreferrer');
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    try {
      await fetch(`/api/rss/articles/${article.id}`, { method: 'DELETE' });
    } catch { /* Erreur silencieuse */ }
  }

  /** Rafraîchit tous les flux et recharge la liste */
  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetch('/api/rss/refresh', { method: 'POST' });
      setOffset(0);
      setHasMore(true);
      setArticles([]);
      await loadArticles(0, selectedFeedId, true);
    } catch { /* Erreur silencieuse */ }
    finally { setIsRefreshing(false); }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white">

      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm px-6 py-3 flex items-center gap-4 sticky top-0 z-20">
        <Link
          href="/"
          className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm flex items-center gap-1.5"
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
      </header>

      {/* Onglets de filtre par flux */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 flex gap-1 overflow-x-auto">
        <button
          onClick={() => handleFeedChange(null)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            selectedFeedId === null
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Tous
        </button>
        {feeds.map((feed) => (
          <button
            key={feed.id}
            onClick={() => handleFeedChange(feed.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              selectedFeedId === feed.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {feed.name}
          </button>
        ))}
      </div>

      {/* Grille d'articles */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {articles.length === 0 && !isLoading && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-600">
            <p className="text-4xl mb-3">📰</p>
            <p className="text-sm">Aucun article disponible</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onClick={() => handleArticleClick(article)}
            />
          ))}
        </div>

        {/* Indicateur de chargement */}
        {isLoading && (
          <div className="flex justify-center py-8">
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

        {/* Fin de liste */}
        {!hasMore && articles.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-8">
            Tous les articles ont été chargés
          </p>
        )}

        {/* Sentinel pour l'IntersectionObserver */}
        <div ref={sentinelRef} className="h-1" />
      </main>
    </div>
  );
}

/** Props de la card article */
interface ArticleCardProps {
  article: RssArticle;
  onClick: () => void;
}

/**
 * Card d'un article RSS.
 * Affiche l'image de couverture (si disponible), le flux source, le titre,
 * la description et la date relative. Un clic ouvre l'article et le marque comme lu.
 */
function ArticleCard({ article, onClick }: ArticleCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onClick}
      className="group bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 text-left flex flex-col"
    >
      {/* Image de couverture */}
      {article.image_url && !imgError ? (
        <div className="w-full h-40 overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500 flex-shrink-0" />
      )}

      {/* Contenu */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Source + date */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">
            {article.feed_name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-600 flex-shrink-0 tabular-nums">
            {formatDateRelative(article.published_at ?? article.created_at)}
          </span>
        </div>

        {/* Titre */}
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-3">
          {article.title}
        </h2>

        {/* Description */}
        {article.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3 flex-1">
            {article.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end mt-auto pt-2">
          <span className="text-xs text-blue-500 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Lire →
          </span>
        </div>
      </div>
    </button>
  );
}
