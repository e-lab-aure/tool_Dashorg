/**
 * @module api/backup/export
 * @description Route API pour l'export complet des données Dashorg.
 * GET : genere un fichier ZIP contenant toutes les donnees en JSON et tous les fichiers (pieces jointes, images).
 *
 * Structure du ZIP :
 *   backup.json            — dump de toutes les tables SQLite
 *   uploads/tasks/{id}/    — pieces jointes des taches
 *   uploads/lists/{id}/    — images des items de listes
 */

import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';
import type { Task, Attachment, ListItem, ListItemImage, ListCategory, RssFeed, RssArticle, BackupData } from '@/lib/types';

/** Repertoire racine des uploads selon l'environnement */
const UPLOADS_ROOT =
  process.env.NODE_ENV === 'production'
    ? '/app/uploads'
    : path.join(process.cwd(), 'uploads');

/**
 * Genere et renvoie un ZIP contenant toutes les donnees et fichiers Dashorg.
 * @returns Fichier ZIP en telechargement
 */
export async function GET(): Promise<NextResponse> {
  try {
    // --- Lecture de toutes les tables ---
    const list_categories = db
      .prepare('SELECT * FROM list_categories ORDER BY position ASC, id ASC')
      .all() as ListCategory[];

    const tasks = db
      .prepare('SELECT * FROM tasks ORDER BY id ASC')
      .all() as Task[];

    const attachments = db
      .prepare('SELECT * FROM attachments ORDER BY id ASC')
      .all() as Attachment[];

    // Les list_items sont exportes sans le champ virtuel "images"
    const list_items = db
      .prepare('SELECT * FROM list_items ORDER BY id ASC')
      .all() as ListItem[];

    const list_item_images = db
      .prepare('SELECT * FROM list_item_images ORDER BY id ASC')
      .all() as ListItemImage[];

    const rss_feeds = db
      .prepare('SELECT * FROM rss_feeds ORDER BY id ASC')
      .all() as RssFeed[];

    // Les articles sont exportes pour eviter de les reperdre apres restauration.
    // Ils seront de toute facon dedoubles a la prochaine synchro grace a l'index UNIQUE sur url.
    const rss_articles = db
      .prepare('SELECT * FROM rss_articles ORDER BY id ASC')
      .all() as RssArticle[];

    const backupData: BackupData = {
      version: 1,
      exported_at: new Date().toISOString(),
      list_categories,
      tasks,
      attachments,
      list_items,
      list_item_images,
      rss_feeds,
      rss_articles,
    };

    // --- Construction du ZIP ---
    const zip = new AdmZip();

    // Ajoute le dump JSON
    zip.addFile('backup.json', Buffer.from(JSON.stringify(backupData, null, 2), 'utf8'));

    // Ajoute les pieces jointes des taches
    const tasksUploadsDir = path.join(UPLOADS_ROOT, 'tasks');
    if (fs.existsSync(tasksUploadsDir)) {
      ajouterFichiersRecursivement(zip, tasksUploadsDir, 'uploads/tasks');
    }

    // Ajoute les images des items de listes
    const listsUploadsDir = path.join(UPLOADS_ROOT, 'lists');
    if (fs.existsSync(listsUploadsDir)) {
      ajouterFichiersRecursivement(zip, listsUploadsDir, 'uploads/lists');
    }

    const zipBuffer = zip.toBuffer();

    // Nom du fichier horodate pour eviter les collisions
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `dashorg_backup_${dateStr}.zip`;

    logger.info(
      'api/backup/export',
      `GET — Export genere : ${tasks.length} taches, ${list_items.length} items, ${attachments.length} pieces jointes, ${list_item_images.length} images, ${rss_feeds.length} flux RSS, ${rss_articles.length} articles RSS — ${zipBuffer.length} octets`
    );

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    logger.error('api/backup/export', `GET — Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de la generation du backup' }, { status: 500 });
  }
}

/**
 * Parcourt recursivement un repertoire et ajoute chaque fichier dans le ZIP
 * en preservant la structure de sous-dossiers relative.
 * @param zip - Instance AdmZip cible
 * @param dirPath - Chemin absolu du repertoire source
 * @param zipPrefix - Prefixe du chemin dans l'archive ZIP
 */
function ajouterFichiersRecursivement(zip: AdmZip, dirPath: string, zipPrefix: string): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`;

    if (entry.isDirectory()) {
      ajouterFichiersRecursivement(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath);
        // Extrait le chemin du dossier parent dans l'archive pour addFile
        const zipDir = zipPath.substring(0, zipPath.lastIndexOf('/'));
        const zipFilename = entry.name;
        zip.addFile(`${zipDir}/${zipFilename}`, content);
      } catch (err) {
        logger.warning(
          'api/backup/export',
          `Fichier ignore lors de l'export : ${fullPath} — ${(err as Error).message}`
        );
      }
    }
  }
}
