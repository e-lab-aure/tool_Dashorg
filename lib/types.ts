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
  /** Identifiant du slot verrouille correspondant dans le board tomorrow (si existant) */
  linked_task_id: number | null;
  /** Date d'archivage, renseignee lors du rollover pour les taches terminees */
  archived_at: string | null;
  /** Date a laquelle la tache a ete marquee comme terminee (done) */
  done_at: string | null;
  /** Identifiant unique de l'email source (RFC 2822 Message-ID), null pour les taches manuelles */
  message_id: string | null;
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
  /** Cle de categorie libre, correspondant a ListCategory.category */
  category: string;
  title: string;
  description: string | null;
  extra_data: string | null;
  /** 0 = non fait, 1 = fait (booleen SQLite) */
  done: number;
  /** 0 = actif, 1 = archive (booleen SQLite) */
  archived: number;
  source: 'manual' | 'imap';
  /** Identifiant unique de l'email source (RFC 2822 Message-ID), null pour les items manuels */
  message_id: string | null;
  /** Position d'affichage dans la liste (tri manuel par drag-and-drop) */
  position: number;
  created_at: string;
  /** Images associees a cet item, peuplees par l'API (non stockees en base) */
  images?: ListItemImage[];
}

/** Résultat du calcul des slots pour demain */
export interface TomorrowSlots {
  locked: number;
  free: number;
  total: number;
}

/** Email reçu avec un tag non reconnu, en attente d'action manuelle */
export interface PendingEmail {
  id: number;
  /** Tag extrait du sujet, ex : "[GAMING]" */
  tag: string;
  /** Sujet complet de l'email */
  subject: string;
  /** Adresse de l'expéditeur */
  from_addr: string | null;
  /** Corps du mail en texte brut */
  body: string | null;
  /** Source MIME brute complète — utilisée pour extraire les PJ lors de la résolution */
  raw_source: string | null;
  /** Message-ID pour déduplication */
  message_id: string | null;
  created_at: string;
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
  /** Flux RSS suivis - optionnel pour compatibilite avec les anciens backups */
  rss_feeds?: RssFeed[];
  /** Articles RSS non lus - optionnel pour compatibilite avec les anciens backups */
  rss_articles?: RssArticle[];
}
