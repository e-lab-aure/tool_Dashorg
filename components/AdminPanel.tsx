'use client';

/**
 * @module AdminPanel
 * @description Panneau d'administration accessible via l'icône clé du header.
 * Deux sections :
 * - Haut : emails en attente (tag non reconnu), avec option de créer la liste et d'ajouter l'item
 * - Bas : console des 50 derniers logs avec défilement automatique et rafraîchissement
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PendingEmail, ListCategory, ListItem } from '@/lib/types';
import type { LogEntry } from '@/lib/logger';
import EmojiPickerButton from '@/components/EmojiPickerButton';

// Couleurs par niveau de log
const LEVEL_STYLES: Record<string, string> = {
  DEBUG:    'text-gray-400 dark:text-gray-500',
  INFO:     'text-blue-600 dark:text-blue-400',
  WARNING:  'text-amber-500 dark:text-amber-400',
  ERROR:    'text-red-500 dark:text-red-400',
  CRITICAL: 'text-red-700 dark:text-red-300 font-bold',
};

/** Formulaire de résolution d'un email en attente */
interface ResolveForm {
  name: string;
  icon: string;
  categoryKey: string;
}

export default function AdminPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // Emails en attente
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [resolving, setResolving] = useState<number | null>(null); // id de l'email en cours de résolution
  const [resolveForms, setResolveForms] = useState<Record<number, ResolveForm>>({});
  const [resolveErrors, setResolveErrors] = useState<Record<number, string>>({});

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Charge les données (emails + logs)
  const loadData = useCallback(async () => {
    try {
      const [emailsRes, logsRes] = await Promise.all([
        fetch('/api/admin/pending-emails'),
        fetch('/api/admin/logs'),
      ]);
      if (emailsRes.ok) {
        const emails = await emailsRes.json() as PendingEmail[];
        setPendingEmails(emails);
        // Initialise les formulaires pour les nouveaux emails
        setResolveForms((prev) => {
          const next = { ...prev };
          for (const email of emails) {
            if (!next[email.id]) {
              // Dérive un nom de liste depuis le tag (ex: "[GAMING]" → "Gaming")
              const tagName = email.tag.replace(/^\[|\]$/g, '');
              const capitalized = tagName.charAt(0) + tagName.slice(1).toLowerCase();
              next[email.id] = {
                name: capitalized,
                icon: '📋',
                categoryKey: tagName.toLowerCase(),
              };
            }
          }
          return next;
        });
      }
      if (logsRes.ok) {
        const newLogs = await logsRes.json() as LogEntry[];
        setLogs(newLogs);
      }
    } catch { /* silence */ }
  }, []);

  // Ouvre le panel et démarre le polling
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }
    loadData();
    pollIntervalRef.current = setInterval(loadData, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, loadData]);

  // Auto-scroll en haut quand de nouveaux logs arrivent (les plus récents sont en tête)
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  // Détecte si l'utilisateur a scrollé manuellement loin du haut
  function handleLogsScroll() {
    const container = logsContainerRef.current;
    if (!container) return;
    setAutoScroll(container.scrollTop < 30);
  }

  // Dismisses un email en attente
  async function handleDismiss(email: PendingEmail) {
    try {
      await fetch(`/api/admin/pending-emails/${email.id}`, { method: 'DELETE' });
      setPendingEmails((prev) => prev.filter((e) => e.id !== email.id));
    } catch { /* silence */ }
  }

  // Résout un email en attente : crée la liste + ajoute l'item
  async function handleResolve(email: PendingEmail) {
    const form = resolveForms[email.id];
    if (!form?.name.trim()) {
      setResolveErrors((prev) => ({ ...prev, [email.id]: 'Le nom est obligatoire' }));
      return;
    }
    setResolving(email.id);
    setResolveErrors((prev) => ({ ...prev, [email.id]: '' }));
    try {
      const res = await fetch(`/api/admin/pending-emails/${email.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          icon: form.icon,
          categoryKey: form.categoryKey,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: string };
        setResolveErrors((prev) => ({ ...prev, [email.id]: error }));
        return;
      }
      const data = await res.json() as { category: ListCategory; item: ListItem };
      setPendingEmails((prev) => prev.filter((e) => e.id !== email.id));
      // Log de confirmation dans la console admin
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now(),
          level: 'INFO',
          context: 'admin',
          message: `Liste "${data.category.name}" créée et item "${data.item.title}" ajouté`,
          timestamp: new Date().toLocaleString('fr-FR'),
        },
      ]);
    } catch {
      setResolveErrors((prev) => ({ ...prev, [email.id]: 'Erreur lors de la création' }));
    } finally {
      setResolving(null);
    }
  }

  function updateForm(emailId: number, patch: Partial<ResolveForm>) {
    setResolveForms((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], ...patch },
    }));
  }

  return (
    <>
      {/* Bouton d'ouverture */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
                   hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative"
        aria-label="Ouvrir le panneau d'administration"
        title="Administration"
      >
        🛠️
        {/* Badge d'alerte si des emails sont en attente */}
        {pendingEmails.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold leading-none">
            {pendingEmails.length > 9 ? '9+' : pendingEmails.length}
          </span>
        )}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
          onClick={() => setIsOpen(false)}
        >
          {/* Panneau latéral */}
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header du panneau */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                🛠️ Administration
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300
                           hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            {/* Corps du panneau : deux sections empilées */}
            <div className="flex flex-col flex-1 min-h-0">

              {/* SECTION HAUTE : Emails en attente */}
              <div className="flex flex-col shrink-0 max-h-[75%] border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 shrink-0">
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Emails en attente
                    {pendingEmails.length > 0 && (
                      <span className="ml-2 text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5">
                        {pendingEmails.length}
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={loadData}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Rafraîchir
                  </button>
                </div>

                <div className="overflow-y-auto flex-1">
                  {pendingEmails.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic px-5 py-4">
                      Aucun email en attente.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {pendingEmails.map((email) => {
                        const form = resolveForms[email.id] ?? { name: '', icon: '📋', categoryKey: '' };
                        const err = resolveErrors[email.id] ?? '';
                        return (
                          <li key={email.id} className="px-5 py-3 space-y-2">
                            {/* Info email */}
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 mt-0.5 text-xs font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                {email.tag}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {email.subject}
                                </p>
                                {email.from_addr && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                    De : {email.from_addr}
                                  </p>
                                )}
                                {email.body && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                    {email.body}
                                  </p>
                                )}
                                <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">
                                  {email.created_at}
                                </p>
                              </div>
                            </div>

                            {/* Formulaire de création de liste */}
                            <div className="flex flex-wrap gap-2 items-end pl-1">
                              <div className="flex items-center gap-1">
                                <EmojiPickerButton
                                  value={form.icon}
                                  onChange={(icon) => updateForm(email.id, { icon })}
                                />
                              </div>
                              <input
                                type="text"
                                value={form.name}
                                onChange={(e) => updateForm(email.id, {
                                  name: e.target.value,
                                  categoryKey: e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_]/g, '_')
                                    .replace(/_+/g, '_')
                                    .replace(/^_|_$/g, ''),
                                })}
                                placeholder="Nom de la liste..."
                                className="text-sm rounded border border-gray-300 dark:border-gray-600
                                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                                           px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                              />
                              <button
                                onClick={() => handleResolve(email)}
                                disabled={resolving === email.id}
                                className="px-3 py-1 text-sm bg-indigo-500 text-white rounded
                                           hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {resolving === email.id ? '...' : 'Créer + ajouter'}
                              </button>
                              <button
                                onClick={() => handleDismiss(email)}
                                className="px-3 py-1 text-sm text-gray-500 dark:text-gray-400
                                           hover:text-red-500 dark:hover:text-red-400 transition-colors"
                              >
                                Ignorer
                              </button>
                            </div>
                            {err && (
                              <p className="text-xs text-red-500 dark:text-red-400 pl-1">{err}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* SECTION BASSE : Console de logs */}
              <div className="flex flex-col min-h-0 max-h-[25%]">
                <div className="flex items-center justify-between px-5 py-2 bg-gray-900 dark:bg-gray-950 shrink-0">
                  <h3 className="text-xs font-mono font-semibold text-green-400">
                    Console ({logs.length}/{50} entrées)
                  </h3>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-3 h-3"
                      />
                      Auto-scroll
                    </label>
                    <button
                      onClick={loadData}
                      className="text-xs text-gray-400 hover:text-green-400 transition-colors font-mono"
                    >
                      ↻
                    </button>
                  </div>
                </div>

                {/* Corps de la console */}
                <div
                  ref={logsContainerRef}
                  onScroll={handleLogsScroll}
                  className="flex-1 overflow-y-auto bg-gray-950 px-4 py-2 font-mono text-xs"
                >
                  {logs.length === 0 ? (
                    <p className="text-gray-600 italic py-2">Aucun log en mémoire.</p>
                  ) : (
                    [...logs].reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className="py-0.5 leading-relaxed whitespace-pre-wrap break-all"
                      >
                        <span className="text-gray-600">{entry.timestamp} </span>
                        <span className={`font-semibold ${LEVEL_STYLES[entry.level] ?? 'text-gray-300'}`}>
                          [{entry.level}]
                        </span>
                        <span className="text-purple-400"> {entry.context}</span>
                        <span className="text-gray-300"> — {entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
