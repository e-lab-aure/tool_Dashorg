/**
 * @module db
 * @description Initialisation et gestion de la connexion SQLite via better-sqlite3.
 * Utilise un singleton pour éviter les reconnexions multiples lors du hot-reload en développement.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from '@/lib/config';

/**
 * Applique les migrations de schéma nécessaires sur une base existante.
 * Utilise des blocs try/catch car SQLite ne supporte pas ADD COLUMN IF NOT EXISTS.
 * @param db - Instance de la base de données SQLite
 */
function applyMigrations(db: Database.Database): void {
  // Migration : lien entre un slot locked de demain et la tâche today d'origine
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_linked_task_id ON tasks(linked_task_id)');
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : date d'archivage pour les tâches terminées
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN archived_at DATETIME');
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : archivage des items de listes
  try {
    db.exec('ALTER TABLE list_items ADD COLUMN archived INTEGER DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS idx_list_items_archived ON list_items(archived)');
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : seed des catégories de liste par défaut si la table vient d'être créée
  try {
    const count = (db.prepare('SELECT COUNT(*) as n FROM list_categories').get() as { n: number }).n;
    if (count === 0) {
      const seedStmt = db.prepare(`
        INSERT INTO list_categories (category, name, tag, icon, position)
        VALUES (@category, @name, @tag, @icon, @position)
      `);
      const defaults = [
        { category: 'film', name: 'Films', tag: '[FILM]', icon: '🎬', position: 0 },
        { category: 'livre', name: 'Livres', tag: '[LIVRE]', icon: '📚', position: 1 },
        { category: 'restaurant', name: 'Restaurants', tag: '[RESTAURANT]', icon: '🍽️', position: 2 },
        { category: 'note', name: 'Notes', tag: '[NOTE]', icon: '📝', position: 3 },
      ];
      for (const row of defaults) seedStmt.run(row);
    }
  } catch {
    // Table déjà seedée ou erreur ignorée
  }

  // Migration : position pour le tri manuel des items de liste
  try {
    db.exec('ALTER TABLE list_items ADD COLUMN position INTEGER DEFAULT 0');
    // Initialise la position à l'id pour conserver l'ordre d'insertion existant
    db.exec('UPDATE list_items SET position = id WHERE position = 0');
    db.exec('CREATE INDEX IF NOT EXISTS idx_list_items_position ON list_items(category, position)');
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : identifiant unique de l'email source pour éviter les doublons IMAP sur les items de liste
  try {
    db.exec('ALTER TABLE list_items ADD COLUMN message_id TEXT');
    // Index partiel : unique uniquement sur les valeurs non-nulles (items manuels non concernés)
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_message_id ON list_items(message_id) WHERE message_id IS NOT NULL'
    );
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : identifiant unique de l'email source pour éviter les doublons IMAP sur les tâches
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN message_id TEXT');
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_message_id ON tasks(message_id) WHERE message_id IS NOT NULL'
    );
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : horodatage du passage en statut "done"
  // Permet l'archivage automatique le lendemain si le rollover de 6h00 n'a pas pu s'exécuter
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN done_at DATETIME');
  } catch {
    // Colonne déjà présente  -  migration ignorée
  }

  // Migration : tables RSS (flux et articles)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rss_feeds (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        url        TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS rss_articles (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id      INTEGER NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        url          TEXT NOT NULL UNIQUE,
        description  TEXT,
        image_url    TEXT,
        published_at DATETIME,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_rss_articles_feed_id ON rss_articles(feed_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_rss_articles_published ON rss_articles(published_at DESC)');
  } catch {
    // Tables déjà créées  -  migration ignorée
  }

  // Migration : description et image_url sur les articles RSS existants
  try {
    db.exec('ALTER TABLE rss_articles ADD COLUMN description TEXT');
  } catch { /* Colonne déjà présente */ }
  try {
    db.exec('ALTER TABLE rss_articles ADD COLUMN image_url TEXT');
  } catch { /* Colonne déjà présente */ }
}

/**
 * Crée les tables SQLite si elles n'existent pas encore.
 * Appelée une seule fois à l'initialisation de la connexion.
 * @param db - Instance de la base de données SQLite
 */
function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      description      TEXT,
      status           TEXT DEFAULT 'todo',
      board            TEXT DEFAULT 'today',
      slot_type        TEXT,
      position         INTEGER,
      source           TEXT DEFAULT 'manual',
      linked_task_id   INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      archived_at      DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      filename     TEXT NOT NULL,
      filepath     TEXT NOT NULL,
      mimetype     TEXT,
      size_bytes   INTEGER,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      extra_data   TEXT,
      done         INTEGER DEFAULT 0,
      source       TEXT DEFAULT 'manual',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_item_images (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      list_item_id  INTEGER NOT NULL REFERENCES list_items(id) ON DELETE CASCADE,
      filename      TEXT NOT NULL,
      filepath      TEXT NOT NULL,
      mimetype      TEXT,
      size_bytes    INTEGER,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_list_item_images_item_id ON list_item_images(list_item_id);

    CREATE TABLE IF NOT EXISTS list_categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      category  TEXT    NOT NULL UNIQUE,
      name      TEXT    NOT NULL,
      tag       TEXT    NOT NULL UNIQUE,
      icon      TEXT    NOT NULL DEFAULT '📋',
      position  INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_list_categories_category ON list_categories(category);
  `);
}

/**
 * Retourne une instance singleton de la base de données SQLite.
 * En développement, réutilise l'instance stockée sur l'objet global
 * pour survivre aux hot-reloads de Next.js.
 * @returns Instance Database connectée et initialisée
 */
function getDatabase(): Database.Database {
  // Clé globale pour le singleton en mode dev
  const globalKey = '__sqliteDb';
  const globalObj = global as Record<string, unknown>;

  if (globalObj[globalKey]) {
    return globalObj[globalKey] as Database.Database;
  }

  // S'assure que le dossier data existe avant de créer la DB
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Optimisations SQLite pour la fiabilite et les performances
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Attente jusqu'a 5 secondes si la base est verrouilee par un autre processus
  db.pragma('busy_timeout = 5000');
  // Cache memoire de 4 Mo pour accelerer les requetes repetees
  db.pragma('cache_size = -4000');

  initTables(db);
  applyMigrations(db);

  // Stocke le singleton sur l'objet global en dev pour éviter les reconnexions
  if (process.env.NODE_ENV !== 'production') {
    globalObj[globalKey] = db;
  }

  return db;
}

export const db = getDatabase();
