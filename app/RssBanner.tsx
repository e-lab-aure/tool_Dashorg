'use client';

/**
 * @module RssBanner
 * @description Bandeau d'actualités RSS positionné sous le header.
 * Les articles défilent vers le haut en continu (marquee CSS).
 * Pause automatique au survol. Clic = ouvre l'article + marque comme lu.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { RssArticle } from '@/lib/types';

/** Hauteur fixe de chaque ligne d'article en pixels */
const ITEM_HEIGHT = 28;

/** Nombre d'articles affichés simultanément */
const VISIBLE_COUNT = 3;

/** Props du composant RssBanner */
interface RssBannerProps {
  onOpenSettings: () => void;
}

/**
 * Formate une date ISO en format court.
 * @param iso - Date ISO 8601
 */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/**
 * Bandeau RSS avec défilement vertical continu.
 */
export default function RssBanner({ onOpenSettings }: RssBannerProps) {
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const loadArticles = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/rss/articles?limit=50');
      if (!res.ok) return;
      setArticles(await res.json() as RssArticle[]);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    loadArticles();
    const interval = setInterval(loadArticles, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadArticles]);

  /**
   * Marque un article comme lu et l'ouvre dans un nouvel onglet.
   */
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
      await loadArticles();
    } catch { /* silencieux */ }
    finally { setIsRefreshing(false); }
  }

  // Bandeau vide
  if (articles.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-1.5 flex items-center justify-between gap-4">
        <span className="text-xs text-gray-400 dark:text-gray-600 italic">
          Aucun article RSS  -  ajoutez des flux via les paramètres
        </span>
        <div className="flex items-center gap-3">
          <button onClick={handleRefresh} disabled={isRefreshing} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors" title="Rafraîchir">
            {isRefreshing ? '...' : '↻'}
          </button>
          <Link href="/rss" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Lecteur RSS">⊞</Link>
          <button onClick={onOpenSettings} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Gérer les flux">⚙ Flux RSS</button>
        </div>
      </div>
    );
  }

  const visibleHeight = VISIBLE_COUNT * ITEM_HEIGHT;
  // 6 secondes par article pour un defilement confortable (env. 4.7px/s)
  const duration = articles.length * 6;
  // Défilement uniquement s'il y a plus d'articles que de lignes visibles
  const shouldScroll = articles.length > VISIBLE_COUNT;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 flex gap-3 items-center">

      {/* Keyframes de l'animation de défilement  -  translate3d force l'acceleration GPU */}
      <style>{`
        @keyframes rss-marquee {
          0%   { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(0, -50%, 0); }
        }
      `}</style>

      {/* Zone de défilement  -  perspective cree un contexte 3D qui stabilise le rendu du texte */}
      <div
        className="flex-1 min-w-0 overflow-hidden"
        style={{ height: visibleHeight, perspective: 1000 }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Liste doublée pour un loop sans saut visible */}
        <div
          style={shouldScroll ? {
            animation: `rss-marquee ${duration}s linear infinite`,
            animationPlayState: isPaused ? 'paused' : 'running',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
          } : undefined}
        >
          {/* Première passe */}
          {articles.map((article) => (
            <ArticleItem
              key={`a-${article.id}`}
              article={article}
              height={ITEM_HEIGHT}
              onClick={() => handleArticleClick(article)}
            />
          ))}
          {/* Seconde passe  -  identique pour le loop continu */}
          {shouldScroll && articles.map((article) => (
            <ArticleItem
              key={`b-${article.id}`}
              article={article}
              height={ITEM_HEIGHT}
              onClick={() => handleArticleClick(article)}
            />
          ))}
        </div>
      </div>

      {/* Contrôles  -  colonne droite */}
      <div className="flex items-center gap-2 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 pl-3 self-stretch py-1.5">
        <span className="text-xs text-gray-400 tabular-nums">{articles.length}</span>
        <button onClick={handleRefresh} disabled={isRefreshing} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors" title="Rafraîchir">
          {isRefreshing ? '...' : '↻'}
        </button>
        <Link href="/rss" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Lecteur RSS">⊞</Link>
        <button onClick={onOpenSettings} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Gérer les flux">⚙</button>
      </div>
    </div>
  );
}

/** Props d'une ligne article */
interface ArticleItemProps {
  article: RssArticle;
  height: number;
  onClick: () => void;
}

/**
 * Ligne d'article dans le bandeau défilant.
 * Hauteur fixe pour garantir la fluidité de l'animation.
 */
function ArticleItem({ article, height, onClick }: ArticleItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left group flex items-center gap-2 min-w-0 px-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      style={{ height }}
      title={article.title}
    >
      <span className="text-xs font-semibold text-blue-500 dark:text-blue-400 flex-shrink-0 leading-none">
        {article.feed_name}
      </span>
      {article.published_at && (
        <span className="text-xs text-gray-400 dark:text-gray-600 flex-shrink-0 leading-none">
          {formatDate(article.published_at)}
        </span>
      )}
      <span className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-none">
        {article.title}
      </span>
    </button>
  );
}
