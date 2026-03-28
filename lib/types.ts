/**
 * @module types
 * @description Définitions des types TypeScript partagés dans toute l'application.
 */

/** Représente une tâche dans le système */
export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'waiting';
  board: 'today' | 'tomorrow' | 'waiting' | 'archive';
  slot_type: 'locked' | 'free' | null;
  position: number | null;
  source: 'manual' | 'imap';
  /** Identifiant du slot verrouillé correspondant dans le board tomorrow (si existant) */
  linked_task_id: number | null;
  /** Date d'archivage, renseignée lors du rollover pour les tâches terminées */
  archived_at: string | null;
  /** Date a laquelle la tâche a été marquée comme terminée (done) */
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Représente un flux RSS suivi */
export interface RssFeed {
  id: number;
  url: string;
  name: string;
  created_at: string;
}

/** Représente un article RSS récupéré depuis un flux */
export interface RssArticle {
  id: number;
  feed_id: number;
  feed_name: string;
  title: string;
  url: string;
  /** Résumé en texte brut extrait du flux */
  description: string | null;
  /** URL de l'image associée à l'article (enclosure, media:content ou première img du contenu) */
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

/** Représente une pièce jointe liée à une tâche */
export interface Attachment {
  id: number;
  task_id: number;
  filename: string;
  filepath: string;
  mimetype: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** Représente une image liée à un item de liste, sauvegardée sur disque */
export interface ListItemImage {
  id: number;
  list_item_id: number;
  filename: string;
  filepath: string;
  mimetype: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** Représente une catégorie de liste, configurable par l'utilisateur */
export interface ListCategory {
  id: number;
  /** Clé interne utilisée dans list_items.category */
  category: string;
  /** Nom d'affichage */
  name: string;
  /** Tag IMAP correspondant, ex. "[FILM]" */
  tag: string;
  /** Emoji affiché dans l'onglet */
  icon: string;
  position: number;
  created_at: string;
}

/** Représente un item dans les listes */
export interface ListItem {
  id: number;
  /** Clé de catégorie libre, correspondant à ListCategory.category */
  category: string;
  title: string;
  description: string | null;
  extra_data: string | null;
  done: number;
  archived: number;
  source: 'manual' | 'imap';
  created_at: string;
  /** Images associées à cet item, peuplées par l'API (non stockées en base) */
  images?: ListItemImage[];
}

/** Résultat du calcul des slots pour demain */
export interface TomorrowSlots {
  locked: number;
  free: number;
  total: number;
}

/** Structure d'un fichier de sauvegarde Dashorg */
export interface BackupData {
  /** Version du format de backup, pour la compatibilité future */
  version: number;
  /** Date et heure de l'export en ISO 8601 */
  exported_at: string;
  list_categories: ListCategory[];
  tasks: Task[];
  attachments: Attachment[];
  list_items: ListItem[];
  list_item_images: ListItemImage[];
  /** Flux RSS suivis — optionnel pour compatibilité avec les anciens backups */
  rss_feeds?: RssFeed[];
  /** Articles RSS non lus — optionnel pour compatibilité avec les anciens backups */
  rss_articles?: RssArticle[];
}
