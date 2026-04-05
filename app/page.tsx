'use client';

/**
 * @module page
 * @description Page principale du dashboard Dashorg.
 * Orchestre l'affichage des composants : TodayBoard, TomorrowBoard,
 * WaitingQueue, ArchivePanel et ListPanel. Gere l'etat global et le basculement dark/light.
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
import AdminPanel from '@/components/AdminPanel';
import RssBanner from '@/app/RssBanner';
import RssModal from '@/app/RssModal';
import type { Task, ListItem } from '@/lib/types';

/** Cle de stockage localStorage pour la preference de theme */
const DARK_MODE_STORAGE_KEY = 'dashorg_dark_mode';

/** Reponse paginee de l'API /api/archive */
interface ArchiveResponse {
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Page principale - charge les donnees initiales et coordonne les mises a jour d'etat.
 */
export default function HomePage() {
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([]);
  const [waitingTasks, setWaitingTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveOffset, setArchiveOffset] = useState(0);
  const [isLoadingMoreArchive, setIsLoadingMoreArchive] = useState(false);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Initialisation du mode sombre depuis localStorage pour eviter le flash au chargement
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(DARK_MODE_STORAGE_KEY);
    return stored !== null ? stored === 'true' : false;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isRssModalOpen, setIsRssModalOpen] = useState(false);

  /**
   * Charge toutes les donnees depuis les APIs au montage du composant.
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
        throw new Error('Erreur lors du chargement des donnees');
      }

      const tasks = await tasksRes.json() as Task[];
      const tomorrow = await tomorrowRes.json() as Task[];
      const lists = await listsRes.json() as ListItem[];
      const archiveData = await archiveRes.json() as ArchiveResponse;

      // Separe les taches today des taches waiting
      setTodayTasks(tasks.filter((t) => t.board === 'today'));
      setWaitingTasks(tasks.filter((t) => t.board === 'waiting'));
      setTomorrowTasks(tomorrow);
      setListItems(lists);
      setArchivedTasks(archiveData.tasks);
      setArchiveTotal(archiveData.total);
      setArchiveOffset(archiveData.tasks.length);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Applique ou retire la classe "dark" sur l'element HTML selon l'etat du toggle.
   * Persiste le choix dans localStorage pour survivre aux rechargements de page.
   */
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(DARK_MODE_STORAGE_KEY, String(isDark));
  }, [isDark]);

  /**
   * Met a jour une tache dans l'etat local apres modification.
   * La tache est replacee dans le bon tableau selon son board.
   * @param updatedTask - Tache mise a jour recue depuis l'API
   */
  function handleTaskUpdate(updatedTask: Task): void {
    // Mise a jour dans le panneau de detail ouvert
    if (selectedTask?.id === updatedTask.id) {
      setSelectedTask(updatedTask);
    }

    // Deplace la tache dans le bon tableau selon son board actuel
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
   * @param newTask - Nouveau slot cree
   */
  function handleTomorrowAdd(newTask: Task): void {
    setTomorrowTasks((prev) =>
      [...prev, newTask].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );
  }

  /**
   * Supprime un slot du tableau de demain.
   * @param taskId - Identifiant du slot supprime
   */
  function handleTomorrowDelete(taskId: number): void {
    setTomorrowTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  /**
   * Gere les changements sur les slots tomorrow declenches par TodayBoard.
   * Cree ou supprime un slot locked dans l'etat local de tomorrow.
   * @param slot - Slot locked cree dans tomorrow, ou null si aucun
   * @param deletedId - Identifiant du slot supprime dans tomorrow, ou null si aucun
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
   * Gere l'injection d'une tache en attente vers today ou tomorrow.
   * @param updatedTask - Tache mise a jour apres injection
   * @param tomorrowSlot - Slot locked cree dans tomorrow lors d'une injection vers today, ou null
   */
  function handleWaitingInject(updatedTask: Task, tomorrowSlot: Task | null): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== updatedTask.id));
    handleTaskUpdate(updatedTask);
    if (tomorrowSlot !== null) {
      handleTomorrowAdd(tomorrowSlot);
    }
  }

  /**
   * Archive une tache depuis la file d'attente.
   * La retire de waiting et l'ajoute en tete des archives.
   * @param archivedTask - Tache archivee retournee par l'API
   */
  function handleWaitingArchive(archivedTask: Task): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== archivedTask.id));
    setArchivedTasks((prev) => [archivedTask, ...prev]);
    setArchiveTotal((prev) => prev + 1);
    setArchiveOffset((prev) => prev + 1);
  }

  /**
   * Supprime definitivement une tache depuis la file d'attente.
   * @param taskId - Identifiant de la tache supprimee
   */
  function handleWaitingDelete(taskId: number): void {
    setWaitingTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  /**
   * Gere la restauration d'une tache archivee en file d'attente.
   * Retire la tache des archives et l'ajoute dans waiting.
   * @param restoredTask - Tache restauree retournee par l'API
   */
  function handleArchiveRestore(restoredTask: Task): void {
    setArchivedTasks((prev) => prev.filter((t) => t.id !== restoredTask.id));
    setArchiveTotal((prev) => Math.max(0, prev - 1));
    setArchiveOffset((prev) => Math.max(0, prev - 1));
    setWaitingTasks((prev) => [restoredTask, ...prev]);
  }

  /**
   * Charge la prochaine page des taches archivees.
   * Appele par ArchivePanel quand l'utilisateur clique sur "Voir plus".
   */
  const handleLoadMoreArchive = useCallback(async (): Promise<void> => {
    if (isLoadingMoreArchive) return;
    setIsLoadingMoreArchive(true);
    try {
      const res = await fetch(`/api/archive?limit=50&offset=${archiveOffset}`);
      if (!res.ok) return;
      const data = await res.json() as ArchiveResponse;
      setArchivedTasks((prev) => [...prev, ...data.tasks]);
      setArchiveTotal(data.total);
      setArchiveOffset((prev) => prev + data.tasks.length);
    } finally {
      setIsLoadingMoreArchive(false);
    }
  }, [archiveOffset, isLoadingMoreArchive]);

  /**
   * Ajoute un item de liste dans l'etat local.
   * @param newItem - Nouvel item cree
   */
  function handleListAdd(newItem: ListItem): void {
    setListItems((prev) => [newItem, ...prev]);
  }

  /**
   * Met a jour un item de liste dans l'etat local.
   * @param updatedItem - Item mis a jour
   */
  function handleListUpdate(updatedItem: ListItem): void {
    setListItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  }

  /**
   * Supprime un item de liste de l'etat local.
   * @param itemId - Identifiant de l'item supprime
   */
  function handleListDelete(itemId: number): void {
    setListItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  /**
   * Met a jour l'etat local apres un reordonnancement d'items dans une categorie.
   * @param reorderedItems - Items reordonnes retournes par l'API avec les nouvelles positions
   */
  function handleListReorder(reorderedItems: ListItem[]): void {
    const updatedIds = new Set(reorderedItems.map((i) => i.id));
    setListItems((prev) => [
      ...prev.filter((i) => !updatedIds.has(i.id)),
      ...reorderedItems,
    ]);
  }

  /**
   * Recharge silencieusement les listes et les taches en arriere-plan.
   * Utilise par le polling automatique pour detecter les nouveaux items crees par le cron IMAP.
   * Ne s'execute pas si l'onglet est masque (document.hidden) pour economiser les ressources.
   */
  const silentRefresh = useCallback(async (): Promise<void> => {
    // Ne pas interroger le serveur si l'utilisateur ne regarde pas l'onglet
    if (document.hidden) return;

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
      // Erreur silencieuse - ne pas interrompre l'experience utilisateur
    }
  }, []);

  // Polling toutes les 60 secondes pour detecter les items crees par le cron IMAP automatique
  useEffect(() => {
    const interval = setInterval(silentRefresh, 60_000);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  /**
   * Declenche une synchronisation IMAP manuelle.
   * Recharge les listes et la file d'attente apres la synchro.
   * Affiche un message de resultat pendant 4 secondes.
   */
  async function handleManualSync(): Promise<void> {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/sync', { method: 'POST' });

      if (!response.ok) throw new Error('Erreur lors de la synchronisation');

      const { created, ignored } = await response.json() as { created: number; ignored: number };

      // Recharge les listes ET les taches pour integrer tous les items importes ([TODO] inclus)
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
          ? `${created} item(s) importe(s), ${ignored} ignore(s)`
          : 'Aucun nouvel email a importer'
      );
    } catch {
      setSyncMessage('Erreur lors de la synchronisation');
    } finally {
      setIsSyncing(false);
      // Efface le message apres 4 secondes
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
          Reessayer
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* En-tete de l'application */}
      <header className="bg-white dark:bg-gray-900 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          {process.env.NEXT_PUBLIC_APP_TITLE ?? 'Dashorg'}
        </h1>

        {/* Horloge flip-flap centree dans le header */}
        <div className="flex-1 flex justify-center">
          <FlipClock />
        </div>

        <div className="flex items-center gap-3">
          {/* Message de resultat de synchronisation */}
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
            {isSyncing ? 'Synchro...' : '\u21bb Synchro mail'}
          </button>

          {/* Bouton de basculement dark/light mode */}
          <button
            onClick={() => setIsDark((prev) => !prev)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
          >
            {isDark ? '\u2600\ufe0f' : '\uD83C\uDF19'}
          </button>

          {/* Engrenage parametres */}
          <BackupPanel onImportSuccess={loadData} />

          {/* Panneau d'administration (logs + emails en attente) */}
          <AdminPanel />
        </div>
      </header>

      {/* Bandeau RSS sous le header */}
      <RssBanner onOpenSettings={() => setIsRssModalOpen(true)} />

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-10">

        {/* SYSTEME 1 : Gestion du quotidien */}
        <section className="space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Gestion du quotidien
          </h2>

          {/* Tableaux Aujourd'hui et Demain cote a cote */}
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

          {/* Archives - taches terminees, repliees par defaut */}
          <ArchivePanel
            tasks={archivedTasks}
            total={archiveTotal}
            onRestore={handleArchiveRestore}
            onLoadMore={handleLoadMoreArchive}
            isLoadingMore={isLoadingMoreArchive}
          />
        </section>

        {/* Separateur visuel entre les deux systemes */}
        <hr className="border-gray-300 dark:border-gray-700" />

        {/* SYSTEME 2 : Listes personnelles */}
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

      {/* Panneau de detail d'une tache (slide-in) */}
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
