'use client';

/**
 * @module page
 * @description Page principale du dashboard Dashorg.
 * Orchestre l'affichage des composants : TodayBoard, TomorrowBoard,
 * WaitingQueue, ArchivePanel et ListPanel. Gère l'état global et le basculement dark/light.
 */

import { useState, useEffect, useCallback } from 'react';
import TodayBoard from '@/components/TodayBoard';
import FlipClock from '@/components/FlipClock';
import TomorrowBoard from '@/components/TomorrowBoard';
import WaitingQueue from '@/components/WaitingQueue';
import ArchivePanel from '@/components/ArchivePanel';
import ListPanel from '@/components/ListPanel';
import TaskDetail from '@/components/TaskDetail';
import BackupPanel from '@/components/BackupPanel';
import RssBanner from '@/app/RssBanner';
import RssModal from '@/app/RssModal';
import type { Task, ListItem } from '@/lib/types';

/**
 * Page principale — charge les données initiales et coordonne les mises à jour d'état.
 */
export default function HomePage() {
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([]);
  const [waitingTasks, setWaitingTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isRssModalOpen, setIsRssModalOpen] = useState(false);

  /**
   * Charge toutes les données depuis les APIs au montage du composant.
   */
  const loadData = useCallback(async (): Promise<void> => {
    try {
      setLoadError(null);

      const [tasksRes, tomorrowRes, listsRes, archiveRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/tomorrow'),
        fetch('/api/lists'),
        fetch('/api/archive'),
      ]);

      if (!tasksRes.ok || !tomorrowRes.ok || !listsRes.ok || !archiveRes.ok) {
        throw new Error('Erreur lors du chargement des données');
      }

      const tasks = await tasksRes.json() as Task[];
      const tomorrow = await tomorrowRes.json() as Task[];
      const lists = await listsRes.json() as ListItem[];
      const archived = await archiveRes.json() as Task[];

      // Sépare les tâches today des tâches waiting
      setTodayTasks(tasks.filter((t) => t.board === 'today'));
      setWaitingTasks(tasks.filter((t) => t.board === 'waiting'));
      setTomorrowTasks(tomorrow);
      setListItems(lists);
      setArchivedTasks(archived);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Applique ou retire la classe "dark" sur l'élément HTML selon l'état du toggle
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  /**
   * Met à jour une tâche dans l'état local après modification.
   * La tâche est replacée dans le bon tableau selon son board.
   * @param updatedTask - Tâche mise à jour reçue depuis l'API
   */
  function handleTaskUpdate(updatedTask: Task): void {
    // Mise à jour dans le panneau de détail ouvert
    if (selectedTask?.id === updatedTask.id) {
      setSelectedTask(updatedTask);
    }

    // Déplace la tâche dans le bon tableau selon son board actuel
    setTodayTasks((prev) => {
      const withoutTask = prev.filter((t) => t.id !== updatedTask.id);
      return updatedTask.board === 'today'
        ? [...withoutTask, updatedTask].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : withoutTask;
    });

    setWaitingTasks((prev) => {
      const withoutTask = prev.filter((t) => t.id !== updatedTask.id);
      return updatedTask.board === 'waiting' || updatedTask.status === 'waiting'
        ? [...withoutTask, updatedTask]
        : withoutTask;
    });

    setTomorrowTasks((prev) => {
      const withoutTask = prev.filter((t) => t.id !== updatedTask.id);
      return updatedTask.board === 'tomorrow'
        ? [...withoutTask, updatedTask].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : withoutTask;
    });
  }

  /**
   * Ajoute un slot libre dans le tableau de demain.
   * @param newTask - Nouveau slot créé
   */
  function handleTomorrowAdd(newTask: Task): void {
    setTomorrowTasks((prev) =>
      [...prev, newTask].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );
  }

  /**
   * Supprime un slot du tableau de demain.
   * @param taskId - Identifiant du slot supprimé
   */
  function handleTomorrowDelete(taskId: number): void {
    setTomorrowTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  /**
   * Gère les changements sur les slots tomorrow déclenchés par TodayBoard.
   * Crée ou supprime un slot locked dans l'état local de tomorrow.
   * @param slot - Slot locked créé dans tomorrow, ou null si aucun
   * @param deletedId - Identifiant du slot supprimé dans tomorrow, ou null si aucun
   */
  function handleTomorrowChange(slot: Task | null, deletedId: number | null): void {
    if (deletedId !== null) {
      setTomorrowTasks((prev) => prev.filter((t) => t.id !== deletedId));
    }
    if (slot !== null) {
      handleTomorrowAdd(slot);
    }
  }

  /**
   * Gère l'injection d'une tâche en attente vers today ou tomorrow.
   * Pour une injection vers today, un slot locked peut avoir été créé dans tomorrow.
   * @param updatedTask - Tâche mise à jour après injection
   * @param tomorrowSlot - Slot locked créé dans tomorrow lors d'une injection vers today, ou null
   */
  function handleWaitingInject(updatedTask: Task, tomorrowSlot: Task | null): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== updatedTask.id));
    handleTaskUpdate(updatedTask);
    if (tomorrowSlot !== null) {
      handleTomorrowAdd(tomorrowSlot);
    }
  }

  /**
   * Archive une tâche depuis la file d'attente.
   * La retire de waiting et l'ajoute en tête des archives.
   * @param archivedTask - Tâche archivée retournée par l'API
   */
  function handleWaitingArchive(archivedTask: Task): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== archivedTask.id));
    setArchivedTasks((prev) => [archivedTask, ...prev]);
  }

  /**
   * Supprime définitivement une tâche depuis la file d'attente.
   * @param taskId - Identifiant de la tâche supprimée
   */
  function handleWaitingDelete(taskId: number): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  /**
   * Gère la restauration d'une tâche archivée en file d'attente.
   * Retire la tâche des archives et l'ajoute dans waiting.
   * @param restoredTask - Tâche restaurée retournée par l'API
   */
  function handleArchiveRestore(restoredTask: Task): void {
    setArchivedTasks((prev) => prev.filter((t) => t.id !== restoredTask.id));
    setWaitingTasks((prev) => [restoredTask, ...prev]);
  }

  /**
   * Ajoute un item de liste dans l'état local.
   * @param newItem - Nouvel item créé
   */
  function handleListAdd(newItem: ListItem): void {
    setListItems((prev) => [newItem, ...prev]);
  }

  /**
   * Met à jour un item de liste dans l'état local.
   * @param updatedItem - Item mis à jour
   */
  function handleListUpdate(updatedItem: ListItem): void {
    setListItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  }

  /**
   * Supprime un item de liste de l'état local.
   * @param itemId - Identifiant de l'item supprimé
   */
  function handleListDelete(itemId: number): void {
    setListItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  /**
   * Met à jour l'état local après un réordonnancement d'items dans une catégorie.
   * Remplace les items concernés par leurs versions avec les nouvelles positions.
   * @param reorderedItems - Items réordonnés retournés par l'API avec les nouvelles positions
   */
  function handleListReorder(reorderedItems: ListItem[]): void {
    const updatedIds = new Set(reorderedItems.map((i) => i.id));
    setListItems((prev) => [
      ...prev.filter((i) => !updatedIds.has(i.id)),
      ...reorderedItems,
    ]);
  }

  /**
   * Recharge silencieusement les listes et les tâches en arrière-plan.
   * Utilisé par le polling automatique pour détecter les nouveaux items créés par le cron IMAP.
   * N'affiche aucun indicateur visuel pour ne pas perturber l'utilisateur.
   */
  const silentRefresh = useCallback(async (): Promise<void> => {
    try {
      const [tasksRes, listsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/lists'),
      ]);

      if (!tasksRes.ok || !listsRes.ok) return;

      const tasks = await tasksRes.json() as Task[];
      const lists = await listsRes.json() as ListItem[];

      setTodayTasks(tasks.filter((t) => t.board === 'today'));
      setWaitingTasks(tasks.filter((t) => t.board === 'waiting'));
      setListItems(lists);
    } catch {
      // Erreur silencieuse - ne pas interrompre l'expérience utilisateur
    }
  }, []);

  // Polling toutes les 60 secondes pour détecter les items créés par le cron IMAP automatique
  useEffect(() => {
    const interval = setInterval(silentRefresh, 60_000);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  /**
   * Déclenche une synchronisation IMAP manuelle.
   * Recharge les listes et la file d'attente après la synchro pour afficher tous les nouveaux items.
   * Affiche un message de résultat pendant 4 secondes.
   */
  async function handleManualSync(): Promise<void> {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/sync', { method: 'POST' });

      if (!response.ok) throw new Error('Erreur lors de la synchronisation');

      const { created, ignored } = await response.json() as { created: number; ignored: number };

      // Recharge les listes ET les tâches pour intégrer tous les items importés ([TODO] inclus)
      const [listsRes, tasksRes] = await Promise.all([
        fetch('/api/lists'),
        fetch('/api/tasks'),
      ]);

      if (listsRes.ok) {
        const lists = await listsRes.json() as ListItem[];
        setListItems(lists);
      }

      if (tasksRes.ok) {
        const tasks = await tasksRes.json() as Task[];
        setTodayTasks(tasks.filter((t) => t.board === 'today'));
        setWaitingTasks(tasks.filter((t) => t.board === 'waiting'));
      }

      setSyncMessage(
        created > 0
          ? `${created} item(s) importé(s), ${ignored} ignoré(s)`
          : 'Aucun nouvel email à importer'
      );
    } catch {
      setSyncMessage('Erreur lors de la synchronisation');
    } finally {
      setIsSyncing(false);
      // Efface le message après 4 secondes
      setTimeout(() => setSyncMessage(null), 4000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-950 gap-4">
        <p className="text-red-500">Erreur : {loadError}</p>
        <button
          onClick={() => { setIsLoading(true); loadData(); }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* En-tête de l'application */}
      <header className="bg-white dark:bg-gray-900 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          {process.env.NEXT_PUBLIC_APP_TITLE ?? 'Dashorg'}
        </h1>

        {/* Horloge flip-flap centrée dans le header */}
        <div className="flex-1 flex justify-center">
          <FlipClock />
        </div>

        <div className="flex items-center gap-3">
          {/* Message de résultat de synchronisation */}
          {syncMessage && (
            <span className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
              {syncMessage}
            </span>
          )}

          {/* Bouton de synchronisation manuelle IMAP */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Synchroniser les emails maintenant"
            title="Synchroniser les emails IMAP maintenant"
          >
            {isSyncing ? 'Synchro...' : '↻ Synchro mail'}
          </button>

          {/* Bouton de basculement dark/light mode */}
          <button
            onClick={() => setIsDark((prev) => !prev)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Engrenage parametres */}
          <BackupPanel onImportSuccess={loadData} />
        </div>
      </header>

      {/* Bandeau RSS sous le header */}
      <RssBanner onOpenSettings={() => setIsRssModalOpen(true)} />

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-10">

        {/* ── SYSTÈME 1 : Gestion du quotidien ─────────────────────────────── */}
        <section className="space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Gestion du quotidien
          </h2>

          {/* Tableaux Aujourd'hui et Demain côte à côte */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TodayBoard
              tasks={todayTasks}
              onUpdate={handleTaskUpdate}
              onSelect={(task) => setSelectedTask(task)}
              onTomorrowAdd={handleTomorrowAdd}
              onTomorrowChange={handleTomorrowChange}
            />
            <TomorrowBoard
              tasks={tomorrowTasks}
              onUpdate={handleTaskUpdate}
              onAdd={handleTomorrowAdd}
              onDelete={handleTomorrowDelete}
              onSelect={(task) => setSelectedTask(task)}
            />
          </div>

          {/* File d'attente sous les deux tableaux */}
          <WaitingQueue
            tasks={waitingTasks}
            onInject={handleWaitingInject}
            onUpdate={handleTaskUpdate}
            onArchive={handleWaitingArchive}
            onDelete={handleWaitingDelete}
            onSelect={(task) => setSelectedTask(task)}
          />

          {/* Archives — tâches terminées, repliées par défaut */}
          <ArchivePanel
            tasks={archivedTasks}
            onRestore={handleArchiveRestore}
          />
        </section>

        {/* ── Séparateur visuel entre les deux systèmes ─────────────────────── */}
        <hr className="border-gray-300 dark:border-gray-700" />

        {/* ── SYSTÈME 2 : Listes personnelles ──────────────────────────────── */}
        <section className="space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Mes listes
          </h2>

          <ListPanel
            items={listItems}
            onAdd={handleListAdd}
            onUpdate={handleListUpdate}
            onDelete={handleListDelete}
            onReorder={handleListReorder}
          />
        </section>


      </main>

      {/* Panneau de détail d'une tâche (slide-in) */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}

      {/* Modale de gestion des flux RSS */}
      {isRssModalOpen && (
        <RssModal onClose={() => setIsRssModalOpen(false)} />
      )}
    </div>
  );
}
