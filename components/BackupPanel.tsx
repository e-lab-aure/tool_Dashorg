'use client';

/**
 * @module BackupPanel
 * @description Modal de parametres Dashorg, accessible via l'engrenage du header.
 * Contient pour l'instant la gestion des sauvegardes (export/import).
 * Prevu pour accueillir d'autres sections (profil utilisateur, preferences...).
 */

import { useRef, useState } from 'react';

/** Rapport retourne par l'API d'import */
interface ImportResult {
  exported_at: string;
  restored: {
    list_categories: number;
    tasks: number;
    attachments: number;
    list_items: number;
    list_item_images: number;
    fichiers: number;
  };
}

/** Etat du panneau de backup */
type BackupStatus =
  | { type: 'idle' }
  | { type: 'exporting' }
  | { type: 'export_ok'; filename: string }
  | { type: 'importing' }
  | { type: 'import_ok'; result: ImportResult }
  | { type: 'error'; message: string };

interface BackupPanelProps {
  /** Callback appele apres un import reussi pour recharger les donnees */
  onImportSuccess: () => void;
}

/**
 * Modal de parametres avec section sauvegarde/restauration.
 * @param onImportSuccess - Callback de rechargement apres import
 */
export default function BackupPanel({ onImportSuccess }: BackupPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<BackupStatus>({ type: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Ferme le modal et reinitialise l'etat */
  function handleClose(): void {
    setIsOpen(false);
    setStatus({ type: 'idle' });
    setSelectedFile(null);
    setConfirmImport(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /** Declenche le telechargement du backup ZIP */
  async function handleExport(): Promise<void> {
    setStatus({ type: 'exporting' });
    try {
      const response = await fetch('/api/backup/export');
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? 'Erreur inconnue');
      }

      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'dashorg_backup.zip';

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      setStatus({ type: 'export_ok', filename });
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  /** Gere la selection du fichier ZIP a importer */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setConfirmImport(false);
    if (status.type !== 'idle') setStatus({ type: 'idle' });
  }

  /** Envoie le ZIP a l'API d'import et recharge l'application */
  async function handleImport(): Promise<void> {
    if (!selectedFile || !confirmImport) return;
    setStatus({ type: 'importing' });
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/backup/import', { method: 'POST', body: formData });
      const body = await response.json() as {
        error?: string;
        success?: boolean;
        exported_at?: string;
        restored?: ImportResult['restored'];
      };

      if (!response.ok || !body.success) {
        throw new Error(body.error ?? 'Erreur lors de l\'import');
      }

      setStatus({ type: 'import_ok', result: { exported_at: body.exported_at!, restored: body.restored! } });
      setSelectedFile(null);
      setConfirmImport(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImportSuccess();
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  return (
    <>
      {/* Bouton engrenage dans le header */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Parametres"
        title="Parametres"
      >
        {/* Engrenage SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Overlay + Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden">

            {/* En-tete du modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Parametres</h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-lg leading-none"
                aria-label="Fermer"
              >
                x
              </button>
            </div>

            {/* Corps du modal */}
            <div className="px-5 py-5 space-y-5">

              {/* Section sauvegarde */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Sauvegarde
                </h3>

                {/* Message d'erreur */}
                {status.type === 'error' && (
                  <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    {status.message}
                  </p>
                )}

                {/* Export */}
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Exporte toutes vos donnees (taches, listes, fichiers joints) dans un ZIP.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleExport}
                      disabled={status.type === 'exporting'}
                      className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {status.type === 'exporting' ? 'Generation...' : 'Exporter les donnees'}
                    </button>
                    {status.type === 'export_ok' && (
                      <span className="text-xs text-green-600 dark:text-green-400">{status.filename}</span>
                    )}
                  </div>
                </div>

                {/* Separateur */}
                <hr className="border-gray-100 dark:border-gray-800" />

                {/* Import */}
                <div className="space-y-2.5">
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      L'import remplace toutes les donnees existantes.
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    className="w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200 dark:hover:file:bg-gray-600 cursor-pointer"
                  />

                  {selectedFile && (
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmImport}
                          onChange={(e) => setConfirmImport(e.target.checked)}
                          className="mt-0.5 accent-red-600"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          Je confirme vouloir remplacer toutes les donnees par celles de <strong>{selectedFile.name}</strong>.
                        </span>
                      </label>

                      <button
                        onClick={handleImport}
                        disabled={!confirmImport || status.type === 'importing'}
                        className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {status.type === 'importing' ? 'Restauration...' : 'Importer et remplacer'}
                      </button>
                    </div>
                  )}

                  {/* Rapport d'import reussi */}
                  {status.type === 'import_ok' && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-3 space-y-1">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                        Restauration reussie - backup du {new Date(status.result.exported_at).toLocaleString('fr-FR')}
                      </p>
                      <ul className="text-xs text-green-600 dark:text-green-500 space-y-0.5">
                        <li>{status.result.restored.tasks} tache(s)</li>
                        <li>{status.result.restored.list_categories} categorie(s)</li>
                        <li>{status.result.restored.list_items} item(s) de listes</li>
                        <li>{status.result.restored.fichiers} fichier(s) sur disque</li>
                      </ul>
                    </div>
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
