/**
 * @module api/backup/import
 * @description Route API pour l'import complet d'un backup Dashorg.
 * POST : recoit un ZIP (multipart/form-data, champ "file"), efface toutes les donnees
 *        existantes et restaure les donnees et fichiers du backup.
 *
 * Ordre de restauration (contraintes FK respectees) :
 *   1. list_categories
 *   2. tasks (linked_task_id = NULL en premiere passe)
 *   3. attachments
 *   4. list_items
 *   5. list_item_images
 *   6. Mise a jour de tasks.linked_task_id
 *   7. rss_feeds
 *   8. rss_articles
 */

import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { UPLOADS_ROOT } from '@/lib/config';
import fs from 'fs';
import path from 'path';
import type { BackupData, RssFeed, RssArticle } from '@/lib/types';

/**
 * Recalcule le chemin absolu d'un fichier uploade en remplacant l'ancien
 * UPLOADS_ROOT (issu du backup) par le UPLOADS_ROOT courant de l'environnement.
 * Gere les deux separateurs (Unix et Windows) pour assurer la portabilite.
 * @param ancienFilepath - Chemin absolu stocke dans le backup
 * @returns Nouveau chemin absolu valide dans l'environnement courant
 */
function recalculerFilepath(ancienFilepath: string): string {
  // Normalise les separateurs de chemin en forward slash pour l'analyse
  const normalise = ancienFilepath.replace(/\\/g, '/');
  // Cherche le marqueur de structure relative (uploads/lists/ ou uploads/tasks/)
  const idx = normalise.indexOf('/uploads/');
  if (idx === -1) return ancienFilepath;
  // Extrait la partie relative : ex. "lists/5/1234_img.jpg" ou "tasks/3/file.png"
  const relative = normalise.slice(idx + '/uploads/'.length);
  return path.join(UPLOADS_ROOT, relative);
}

/**
 * Importe un fichier ZIP de backup Dashorg.
 * Efface toutes les donnees existantes avant de restaurer.
 * @param request - Requete multipart/form-data avec le champ "file" (ZIP)
 * @returns Rapport d'import en JSON
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'Le fichier doit etre un ZIP Dashorg' }, { status: 400 });
    }

    // Lecture du ZIP en memoire
    const arrayBuffer = await file.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      return NextResponse.json({ error: 'Fichier ZIP invalide ou corrompu' }, { status: 400 });
    }

    // Extraction et validation du fichier backup.json
    const backupEntry = zip.getEntry('backup.json');
    if (!backupEntry) {
      return NextResponse.json({ error: 'backup.json introuvable dans le ZIP  -  fichier invalide' }, { status: 400 });
    }

    let backup: BackupData;
    try {
      backup = JSON.parse(backupEntry.getData().toString('utf8')) as BackupData;
    } catch {
      return NextResponse.json({ error: 'backup.json invalide ou mal forme' }, { status: 400 });
    }

    if (!backup.version || !backup.exported_at) {
      return NextResponse.json({ error: 'Format de backup non reconnu (version ou date manquante)' }, { status: 400 });
    }

    // --- Restauration dans une transaction atomique ---
    const restaurer = db.transaction(() => {

      // Suppression dans l'ordre inverse des dependances FK
      db.exec('DELETE FROM rss_articles');
      db.exec('DELETE FROM rss_feeds');
      db.exec('DELETE FROM list_item_images');
      db.exec('DELETE FROM attachments');
      db.exec('DELETE FROM list_items');
      db.exec('DELETE FROM list_categories');
      // tasks en dernier : auto-reference linked_task_id avec ON DELETE SET NULL
      db.exec('DELETE FROM tasks');

      // Remise a zero des sequences AUTOINCREMENT
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('tasks','attachments','list_items','list_item_images','list_categories','rss_feeds','rss_articles')");

      // 1. Restauration des categories de listes
      const insertCategory = db.prepare(`
        INSERT INTO list_categories (id, category, name, tag, icon, position, created_at)
        VALUES (@id, @category, @name, @tag, @icon, @position, @created_at)
      `);
      for (const cat of backup.list_categories) {
        insertCategory.run(cat);
      }

      // 2. Restauration des taches  -  linked_task_id insere a NULL pour eviter
      //    les violations FK en cas d'insertion hors ordre
      const insertTask = db.prepare(`
        INSERT INTO tasks (id, title, description, status, board, slot_type, position, source, linked_task_id, archived_at, done_at, message_id, created_at, updated_at)
        VALUES (@id, @title, @description, @status, @board, @slot_type, @position, @source, NULL, @archived_at, @done_at, @message_id, @created_at, @updated_at)
      `);
      for (const task of backup.tasks) {
        insertTask.run({ ...task, done_at: (task as unknown as Record<string, unknown>)['done_at'] ?? null });
      }

      // Mise a jour de linked_task_id en seconde passe, une fois toutes les taches inserees
      const updateLinked = db.prepare('UPDATE tasks SET linked_task_id = @linked_task_id WHERE id = @id');
      for (const task of backup.tasks) {
        if (task.linked_task_id !== null && task.linked_task_id !== undefined) {
          updateLinked.run({ id: task.id, linked_task_id: task.linked_task_id });
        }
      }

      // 3. Restauration des pieces jointes  -  recalcul du filepath pour l'environnement courant
      const insertAttachment = db.prepare(`
        INSERT INTO attachments (id, task_id, filename, filepath, mimetype, size_bytes, created_at)
        VALUES (@id, @task_id, @filename, @filepath, @mimetype, @size_bytes, @created_at)
      `);
      for (const att of backup.attachments) {
        insertAttachment.run({ ...att, filepath: recalculerFilepath(att.filepath) });
      }

      // 4. Restauration des items de listes (sans le champ virtuel "images")
      const insertItem = db.prepare(`
        INSERT INTO list_items (id, category, title, description, extra_data, done, archived, source, message_id, position, created_at)
        VALUES (@id, @category, @title, @description, @extra_data, @done, @archived, @source, @message_id, @position, @created_at)
      `);
      for (const item of backup.list_items) {
        insertItem.run({
          id: item.id,
          category: item.category,
          title: item.title,
          description: item.description ?? null,
          extra_data: item.extra_data ?? null,
          done: item.done,
          archived: item.archived,
          source: item.source,
          message_id: (item as unknown as Record<string, unknown>)['message_id'] ?? null,
          position: (item as unknown as Record<string, unknown>)['position'] ?? item.id,
          created_at: item.created_at,
        });
      }

      // 5. Restauration des images d'items  -  recalcul du filepath pour l'environnement courant
      const insertImage = db.prepare(`
        INSERT INTO list_item_images (id, list_item_id, filename, filepath, mimetype, size_bytes, created_at)
        VALUES (@id, @list_item_id, @filename, @filepath, @mimetype, @size_bytes, @created_at)
      `);
      for (const img of backup.list_item_images) {
        insertImage.run({ ...img, filepath: recalculerFilepath(img.filepath) });
      }

      // 6. Restauration des flux RSS  -  compatibilite avec les anciens backups sans RSS
      if (backup.rss_feeds && backup.rss_feeds.length > 0) {
        const insertFeed = db.prepare(`
          INSERT INTO rss_feeds (id, url, name, created_at)
          VALUES (@id, @url, @name, @created_at)
        `);
        for (const feed of backup.rss_feeds) {
          insertFeed.run(feed as RssFeed);
        }
      }

      // 7. Restauration des articles RSS  -  INSERT OR IGNORE pour tolerer les doublons
      //    (l'index UNIQUE sur url protege contre les reimportations apres refresh)
      if (backup.rss_articles && backup.rss_articles.length > 0) {
        const insertArticle = db.prepare(`
          INSERT OR IGNORE INTO rss_articles (id, feed_id, title, url, description, image_url, published_at, created_at)
          VALUES (@id, @feed_id, @title, @url, @description, @image_url, @published_at, @created_at)
        `);
        for (const article of backup.rss_articles) {
          insertArticle.run({
            ...(article as RssArticle),
            description: (article as RssArticle).description ?? null,
            image_url: (article as RssArticle).image_url ?? null,
          });
        }
      }
    });

    restaurer();

    // --- Restauration des fichiers sur disque ---
    let fichiersRestores = 0;
    let fichiersIgnores = 0;

    for (const entry of zip.getEntries()) {
      const entryName = entry.entryName;

      // Seuls les fichiers sous uploads/ sont traites
      if (!entryName.startsWith('uploads/') || entry.isDirectory) {
        continue;
      }

      // Reconstruction du chemin absolu en verifiant qu'il reste dans UPLOADS_ROOT (securite path traversal)
      const relativePath = entryName.slice('uploads/'.length);
      const destPath = path.resolve(UPLOADS_ROOT, relativePath);

      if (!destPath.startsWith(path.resolve(UPLOADS_ROOT))) {
        logger.warning('api/backup/import', `Entree ZIP ignoree (path traversal detecte) : ${entryName}`);
        fichiersIgnores++;
        continue;
      }

      try {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.writeFileSync(destPath, entry.getData());
        fichiersRestores++;
      } catch (err) {
        logger.warning('api/backup/import', `Fichier non restaure : ${entryName}  -  ${(err as Error).message}`);
        fichiersIgnores++;
      }
    }

    const rssFeedsCount = backup.rss_feeds?.length ?? 0;
    const rssArticlesCount = backup.rss_articles?.length ?? 0;

    logger.info(
      'api/backup/import',
      `POST  -  Import termine : ${backup.tasks.length} taches, ${backup.list_items.length} items, ` +
      `${backup.attachments.length} pieces jointes, ${backup.list_item_images.length} images, ` +
      `${rssFeedsCount} flux RSS, ${rssArticlesCount} articles RSS, ` +
      `${fichiersRestores} fichiers restaures, ${fichiersIgnores} fichiers ignores`
    );

    return NextResponse.json({
      success: true,
      exported_at: backup.exported_at,
      restored: {
        list_categories: backup.list_categories.length,
        tasks: backup.tasks.length,
        attachments: backup.attachments.length,
        list_items: backup.list_items.length,
        list_item_images: backup.list_item_images.length,
        rss_feeds: rssFeedsCount,
        rss_articles: rssArticlesCount,
        fichiers: fichiersRestores,
      },
    });
  } catch (error) {
    logger.error('api/backup/import', `POST  -  Erreur : ${(error as Error).message}`);
    return NextResponse.json({ error: 'Erreur lors de l\'import du backup' }, { status: 500 });
  }
}
