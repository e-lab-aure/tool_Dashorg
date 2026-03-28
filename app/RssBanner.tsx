'use client';

/**
 * @module RssBanner
 * @description Bandeau d'actualités RSS positionné sous le header.
 * Affiche les articles par groupes de 3 dans un bandeau horizontal scrollable.
 * Un clic sur un article l'ouvre dans un nouvel onglet et le marque comme lu (disparition).
 * Un bouton de gestion ouvre la modale de configuration des flux.
 */

import { useState, useEffect, useCallback } from 'react';
import type { RssArticle } from '@/lib/types';

/** Props du composant RssBanner */
interface RssBannerProps {
  /** Callback pour ouvrir la modale de gestion des flux */
  onOpenSettings: () => void;
}

/**
 * Formate une date ISO en format court lisible (ex: "27 mars").
 * Retourne une chaîne vide si la date est invalide ou absente.
 * @param iso - Chaîne de date ISO 8601
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
 * Bandeau d'actualités RSS.
 * Charge les articles au montage et se rafraîchit toutes les 5 minutes.
 */
export default function RssBanner({ onOpenSettings }: RssBannerProps) {
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [offset, setOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Charge les articles non lus depuis l'API.
   */
  const loadArticles = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/rss/articles');
      if (!res.ok) return;
      const data = await res.json() as RssArticle[];
      setArticles(data);
      // Réajuste l'offset si on a moins d'articles qu'avant
      setOffset((prev) => Math.min(prev, Math.max(0, data.length - 3)));
    } catch {
      // Erreur silencieuse — le bandeau reste vide
    }
  }, []);

  useEffect(() => {
    loadArticles();
    // Rafraîchissement automatique toutes les 5 minutes
    const interval = setInterval(loadArticles, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadArticles]);

  /**
   * Marque un article comme lu : le supprime via l'API et le retire de l'état local.
   * Ouvre le lien dans un nouvel onglet.
   * @param article - Article cliqué
   */
  async function handleArticleClick(article: RssArticle): Promise<void> {
    // Ouvre le lien immédiatement sans attendre la réponse API
    window.open(article.url, '_blank', 'noopener,noreferrer');

    // Supprime localement pour un retour immédiat
    setArticles((prev) => {
      const updated = prev.filter((a) => a.id !== article.id);
      // Ajuste l'offset si nécessaire
      setOffset((o) => Math.min(o, Math.max(0, updated.length - 3)));
      return updated;
    });

    // Suppression en base (fire and forget)
    try {
      await fetch(`/api/rss/articles/${article.id}`, { method: 'DELETE' });
    } catch {
      // Erreur silencieuse
    }
  }

  /**
   * Déclenche un rafraîchissement manuel des flux RSS.
   */
  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetch('/api/rss/refresh', { method: 'POST' });
      await loadArticles();
    } catch {
      // Erreur silencieuse
    } finally {
      setIsRefreshing(false);
    }
  }

  // Si aucun flux/article, n'affiche pas le bandeau
  if (articles.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-1.5 flex items-center justify-between gap-4">
        <span className="text-xs text-gray-400 dark:text-gray-600 italic">
          Aucun article RSS — ajoutez des flux via les paramètres
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
            title="Rafraîchir les flux"
          >
            {isRefreshing ? '...' : '↻'}
          </button>
          <button
            onClick={onOpenSettings}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Gérer les flux RSS"
          >
            ⚙ Flux RSS
          </button>
        </div>
      </div>
    );
  }

  /** Articles visibles dans la fenêtre courante (3 à la fois) */
  const visible = articles.slice(offset, offset + 3);
  const canPrev = offset > 0;
  const canNext = offset + 3 < articles.length;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-1.5 flex items-center gap-2">

      {/* Bouton précédent */}
      <button
        onClick={() => setOffset((o) => Math.max(0, o - 3))}
        disabled={!canPrev}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 text-xs flex-shrink-0 transition-colors"
        aria-label="Articles précédents"
      >
        ◀
      </button>

      {/* Articles (3 visibles) — affichage inline séparé par des traits verticaux */}
      <div className="flex-1 flex items-center min-w-0 divide-x divide-gray-200 dark:divide-gray-700">
        {visible.map((article) => (
          <button
            key={article.id}
            onClick={() => handleArticleClick(article)}
            className="flex-1 text-left group min-w-0 px-3 first:pl-0 flex items-baseline gap-1.5 truncate"
            title={article.title}
          >
            <span className="text-xs text-blue-500 dark:text-blue-400 font-medium flex-shrink-0">
              {article.feed_name}
            </span>
            {article.published_at && (
              <span className="text-xs text-gray-400 dark:text-gray-600 flex-shrink-0">
                {formatDate(article.published_at)}
              </span>
            )}
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {article.title}
            </span>
          </button>
        ))}

        {/* Remplissage si moins de 3 articles */}
        {visible.length < 3 && Array.from({ length: 3 - visible.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex-1 px-3" />
        ))}
      </div>

      {/* Bouton suivant */}
      <button
        onClick={() => setOffset((o) => Math.min(articles.length - 1, o + 3))}
        disabled={!canNext}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20 text-xs flex-shrink-0 transition-colors"
        aria-label="Articles suivants"
      >
        ▶
      </button>

      {/* Compteur + contrôles */}
      <div className="flex items-center gap-2 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
        <span className="text-xs text-gray-400 tabular-nums">
          {offset + 1}-{Math.min(offset + 3, articles.length)}/{articles.length}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          title="Rafraîchir les flux"
        >
          {isRefreshing ? '...' : '↻'}
        </button>
        <button
          onClick={onOpenSettings}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Gérer les flux RSS"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
