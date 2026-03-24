/**
 * @module imap
 * @description Polling IMAP pour créer automatiquement des items et des tâches à partir des emails.
 * - [TODO] TITRE : crée une tâche en file d'attente (board "waiting"), avec le corps du mail comme description
 * - [FILM], [LIVRE], [RESTAURANT], [NOTE] ou tout tag personnalisé : crée un item dans la liste correspondante
 * Les emails sans tag reconnu sont ignorés mais traités (marqués lus, supprimés ou archivés).
 */

import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Actions possibles sur un email après traitement.
 * Configuré via la variable d'environnement IMAP_PROCESSED_ACTION.
 * - 'read'    : marque l'email comme lu (flag \Seen) — peut ne pas fonctionner sur certains serveurs
 * - 'delete'  : supprime définitivement l'email de la boîte
 * - 'archive' : déplace l'email dans le dossier défini par IMAP_ARCHIVE_FOLDER
 */
type ImapProcessedAction = 'read' | 'delete' | 'archive';

/**
 * Applique l'action configurée sur un email après son traitement (import ou ignoré).
 * Garantit qu'il ne sera plus repris par les synchros suivantes.
 * @param client - Instance ImapFlow connectée
 * @param uid - UID de l'email à traiter
 * @param action - Action à appliquer sur l'email
 * @param archiveFolder - Dossier de destination si action = 'archive'
 * @param subject - Sujet de l'email (pour les logs)
 */
async function appliquerActionEmail(
  client: ImapFlow,
  uid: number,
  action: ImapProcessedAction,
  archiveFolder: string,
  subject: string
): Promise<void> {
  switch (action) {
    case 'delete':
      await client.messageDelete([uid], { uid: true });
      logger.info('imap', `Email supprimé : uid=${uid}, sujet="${subject}"`);
      break;

    case 'archive':
      await client.messageMove([uid], archiveFolder, { uid: true });
      logger.info('imap', `Email archivé dans "${archiveFolder}" : uid=${uid}, sujet="${subject}"`);
      break;

    case 'read':
    default:
      await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
      logger.info('imap', `Email marqué comme lu : uid=${uid}, sujet="${subject}"`);
      break;
  }
}

/**
 * Extrait la catégorie et le titre nettoyé à partir du sujet d'un email.
 * La correspondance tag→catégorie est lue dynamiquement depuis la base de données
 * pour prendre en compte les listes personnalisées créées par l'utilisateur.
 * Retourne null si aucun tag connu n'est trouvé.
 * @param subject - Sujet brut de l'email
 * @param tagToCategory - Mapping tag→catégorie lu depuis list_categories
 * @returns Objet { category, cleanTitle } ou null si pas de tag connu
 */
function parseSubject(
  subject: string,
  tagToCategory: Record<string, string>
): { category: string; cleanTitle: string } | null {
  const upperSubject = subject.toUpperCase();

  for (const [tag, category] of Object.entries(tagToCategory)) {
    if (upperSubject.startsWith(tag)) {
      // Supprime le tag du début du sujet pour obtenir le titre propre
      const cleanTitle = subject.slice(tag.length).trim();
      return { category, cleanTitle: cleanTitle || subject };
    }
  }

  return null;
}

/**
 * Extrait le Message-ID depuis la source brute d'un email.
 * Le Message-ID est un identifiant unique défini dans le RFC 2822.
 * Utilisé pour éviter les doublons en base lors des synchros répétées.
 * @param source - Source brute du message
 * @returns Message-ID nettoyé, ou null si absent
 */
function extractMessageId(source: string): string | null {
  const match = source.match(/^Message-ID:\s*(.+)$/im);
  if (!match) return null;
  // Supprime les éventuels retours à la ligne de continuation MIME et les espaces superflus
  return match[1].replace(/\r?\n\s+/g, ' ').trim();
}

/**
 * Extrait le corps textuel d'un message IMAP.
 * Préfère le contenu texte brut de la partie text/plain.
 * Si la partie text/plain est trouvée mais vide (ex: mail avec seulement une pièce jointe),
 * retourne une chaîne vide sans tenter de repli — ce qui évite de capturer du contenu MIME brut.
 * Le repli sur le contenu brut n'est tenté que pour les emails sans structure multipart.
 * @param source - Source brute du message
 * @returns Corps textuel du message, chaîne vide si aucun texte trouvé
 */
function extractTextBody(source: string): string {
  // Recherche la partie text/plain dans le message brut
  const textPlainMatch = source.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\r?\n--|\s*$)/i
  );

  // Si une partie text/plain est trouvée, on utilise son contenu même s'il est vide.
  // Ne pas tomber dans le repli évite de capturer les boundaries et headers MIME des pièces jointes.
  if (textPlainMatch !== null) {
    return (textPlainMatch[1] ?? '').trim();
  }

  // Repli uniquement pour les emails sans structure multipart (emails texte simples).
  // Pour les emails multipart sans text/plain détecté, on retourne vide plutôt que du MIME brut.
  if (/Content-Type:\s*multipart\//i.test(source)) {
    return '';
  }

  const bodyMatch = source.match(/\r?\n\r?\n([\s\S]+)/);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim();
  }

  return '';
}

/** Répertoire de stockage des images d'items de liste selon l'environnement */
const LISTS_UPLOADS_BASE =
  process.env.NODE_ENV === 'production'
    ? '/app/uploads/lists'
    : path.join(process.cwd(), 'uploads', 'lists');

/** Répertoire de stockage des pièces jointes de tâches selon l'environnement */
const TASKS_UPLOADS_BASE =
  process.env.NODE_ENV === 'production'
    ? '/app/uploads/tasks'
    : path.join(process.cwd(), 'uploads', 'tasks');

/** Représente une image extraite d'un email MIME */
interface ExtractedImage {
  filename: string;
  data: Buffer;
  mimetype: string;
}

/**
 * Extrait les images (pièces jointes et inline) depuis la source brute d'un email MIME.
 * Gère les encodages base64 et quoted-printable.
 * Retourne un tableau d'images avec leur contenu décodé.
 * @param source - Source brute du message MIME
 * @returns Tableau des images extraites
 */
function extractImagesFromMime(source: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  // Recherche la boundary dans le Content-Type multipart de l'email
  const boundaryMatch = source.match(
    /Content-Type:\s*multipart\/[^;\r\n]+;\s*(?:[^;\r\n]+;\s*)*boundary="?([^"\r\n]+)"?/i
  );
  if (!boundaryMatch) return images;

  const boundary = boundaryMatch[1].trim();
  // Échappe les caractères spéciaux regex dans la boundary
  const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = source.split(new RegExp(`--${escapedBoundary}(?:--)?\\r?\\n?`));

  for (const part of parts) {
    // Filtre les parties vides ou qui sont le marqueur de fin
    if (!part || part.trim() === '--') continue;

    // Vérifie si la partie a un Content-Type image
    const contentTypeMatch = part.match(/Content-Type:\s*(image\/[^\s;]+)/i);
    if (!contentTypeMatch) continue;

    const mimetype = contentTypeMatch[1].toLowerCase().trim();

    // Détermine le nom du fichier depuis Content-Disposition ou Content-Type
    const dispositionFilenameMatch = part.match(/Content-Disposition:[^\r\n]*filename="?([^"\r\n]+)"?/i);
    const typeFilenameMatch = part.match(/Content-Type:[^\r\n]*name="?([^"\r\n]+)"?/i);
    const extension = mimetype.split('/')[1] ?? 'jpg';
    const rawFilename =
      dispositionFilenameMatch?.[1]?.trim() ??
      typeFilenameMatch?.[1]?.trim() ??
      `image_${Date.now()}.${extension}`;

    // Sécurise le nom de fichier
    const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Détermine l'encodage de transfert (base64 par défaut pour les images)
    const encodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encodingMatch?.[1]?.toLowerCase() ?? 'base64';

    // Extrait les données après la ligne vide séparant les en-têtes du corps
    const bodyMatch = part.match(/\r?\n\r?\n([\s\S]+)/);
    if (!bodyMatch) continue;

    const rawData = bodyMatch[1].trim();

    try {
      if (encoding === 'base64') {
        // Supprime les sauts de ligne avant de décoder
        const cleanData = rawData.replace(/\s/g, '');
        const buffer = Buffer.from(cleanData, 'base64');
        if (buffer.length > 0) {
          images.push({ filename, data: buffer, mimetype });
        }
      } else if (encoding === 'quoted-printable') {
        // Décode le quoted-printable : remplace les séquences =XX et les retours souples
        const decoded = rawData
          .replace(/=\r?\n/g, '')
          .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        const buffer = Buffer.from(decoded, 'binary');
        if (buffer.length > 0) {
          images.push({ filename, data: buffer, mimetype });
        }
      }
    } catch (decodeError) {
      logger.warning('imap', `Impossible de décoder l'image "${filename}" : ${(decodeError as Error).message}`);
    }
  }

  return images;
}

/**
 * Sauvegarde les images extraites d'un email sur le disque et en base de données.
 * Les fichiers sont stockés dans uploads/lists/{itemId}/ avec un nom horodaté.
 * @param images - Images extraites du message MIME
 * @param itemId - Identifiant de l'item de liste auquel rattacher les images
 * @returns Nombre d'images sauvegardées avec succès
 */
function saveImagesToItem(images: ExtractedImage[], itemId: number): number {
  if (images.length === 0) return 0;

  const itemDir = path.join(LISTS_UPLOADS_BASE, String(itemId));

  // Crée le répertoire de l'item si nécessaire
  if (!fs.existsSync(itemDir)) {
    fs.mkdirSync(itemDir, { recursive: true });
  }

  let saved = 0;

  const stmt = db.prepare(`
    INSERT INTO list_item_images (list_item_id, filename, filepath, mimetype, size_bytes)
    VALUES (@list_item_id, @filename, @filepath, @mimetype, @size_bytes)
  `);

  for (const image of images) {
    try {
      const timestamp = Date.now();
      const safeFilename = `${timestamp}_${image.filename}`;
      const filepath = path.join(itemDir, safeFilename);

      fs.writeFileSync(filepath, image.data);

      stmt.run({
        list_item_id: itemId,
        filename: image.filename,
        filepath,
        mimetype: image.mimetype,
        size_bytes: image.data.length,
      });

      logger.info('imap', `Image sauvegardée : "${safeFilename}" pour item id=${itemId}`);
      saved++;
    } catch (saveError) {
      logger.error(
        'imap',
        `Erreur sauvegarde image "${image.filename}" pour item id=${itemId} : ${(saveError as Error).message}`
      );
    }
  }

  return saved;
}

/**
 * Sauvegarde les images extraites d'un email sur le disque et en base dans la table attachments.
 * Les fichiers sont stockés dans uploads/tasks/{taskId}/ avec un nom horodaté.
 * @param images - Images extraites du message MIME
 * @param taskId - Identifiant de la tâche à laquelle rattacher les fichiers
 * @returns Nombre d'images sauvegardées avec succès
 */
function saveImagesToTask(images: ExtractedImage[], taskId: number): number {
  if (images.length === 0) return 0;

  const taskDir = path.join(TASKS_UPLOADS_BASE, String(taskId));

  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  let saved = 0;

  const stmt = db.prepare(`
    INSERT INTO attachments (task_id, filename, filepath, mimetype, size_bytes)
    VALUES (@task_id, @filename, @filepath, @mimetype, @size_bytes)
  `);

  for (const image of images) {
    try {
      const timestamp = Date.now();
      const safeFilename = `${timestamp}_${image.filename}`;
      const filepath = path.join(taskDir, safeFilename);

      fs.writeFileSync(filepath, image.data);

      stmt.run({
        task_id: taskId,
        filename: image.filename,
        filepath,
        mimetype: image.mimetype,
        size_bytes: image.data.length,
      });

      logger.info('imap', `Image sauvegardée pour tâche id=${taskId} : "${safeFilename}"`);
      saved++;
    } catch (saveError) {
      logger.error(
        'imap',
        `Erreur sauvegarde image "${image.filename}" pour tâche id=${taskId} : ${(saveError as Error).message}`
      );
    }
  }

  return saved;
}

/** Résultat retourné par pollImap pour informer l'appelant du bilan de la synchronisation */
export interface ImapSyncResult {
  /** Nombre d'items créés en base depuis les emails */
  created: number;
  /** Nombre d'emails ignorés (pas de tag reconnu) */
  ignored: number;
}

/**
 * Interroge le serveur IMAP, lit les emails non lus et les traite selon leur tag :
 * - [TODO] TITRE : crée une tâche en file d'attente dans le board "waiting"
 * - Tags de liste ([FILM], [LIVRE], etc.) : crée un item dans la catégorie correspondante
 * - Aucun tag reconnu : email ignoré, mais marqué lu / archivé / supprimé selon la config
 * La déduplication par Message-ID garantit qu'un email ne génère jamais deux entrées.
 * @returns Bilan de la synchronisation : nombre d'items/tâches créés et d'emails ignorés
 */
export async function pollImap(): Promise<ImapSyncResult> {
  // Récupération des variables d'environnement IMAP
  const host = process.env.IMAP_HOST;
  const port = parseInt(process.env.IMAP_PORT ?? '993', 10);
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  const useTls = process.env.IMAP_TLS !== 'false';

  // Action appliquée sur chaque email après traitement (read | delete | archive)
  const rawAction = process.env.IMAP_PROCESSED_ACTION ?? 'read';
  const processedAction: ImapProcessedAction =
    rawAction === 'delete' || rawAction === 'archive' ? rawAction : 'read';
  const archiveFolder = process.env.IMAP_ARCHIVE_FOLDER ?? 'Archive';

  if (!host || !user || !password) {
    logger.warning('imap', 'Polling ignoré — variables IMAP_HOST, IMAP_USER ou IMAP_PASSWORD manquantes');
    return { created: 0, ignored: 0 };
  }

  // Lecture dynamique des catégories depuis la DB — supporte les listes personnalisées
  const categoryRows = db
    .prepare('SELECT tag, category FROM list_categories')
    .all() as { tag: string; category: string }[];
  const tagToCategory: Record<string, string> = {};
  for (const row of categoryRows) {
    tagToCategory[row.tag.toUpperCase()] = row.category;
  }

  logger.info(
    'imap',
    `Action configurée sur les emails traités : "${processedAction}"` +
      (processedAction === 'archive' ? ` → dossier "${archiveFolder}"` : '')
  );

  const client = new ImapFlow({
    host,
    port,
    secure: useTls,
    auth: { user, pass: password },
    // Désactive les logs verbeux d'imapflow pour éviter de polluer la sortie
    logger: false,
  });

  try {
    logger.info('imap', `Connexion à ${host}:${port} (TLS: ${useTls})`);
    await client.connect();

    // Ouvre la boîte INBOX explicitement en lecture/écriture avant d'acquérir le lock.
    // Sans cet appel explicite, certains serveurs (OVH notamment) ouvrent en lecture seule,
    // ce qui rend impossibles les opérations d'écriture (flag, suppression, déplacement).
    await client.mailboxOpen('INBOX', { readOnly: false });
    const lock = await client.getMailboxLock('INBOX');

    let created = 0;
    let ignored = 0;

    try {
      // Recherche les UIDs des messages non lus — uid:true garantit des UIDs stables
      // (les numéros de séquence peuvent changer lors d'une expunge par un autre client)
      const searchResult = await client.search({ seen: false }, { uid: true });
      const unseenUids = Array.isArray(searchResult) && searchResult.length > 0 ? searchResult : [];

      if (unseenUids.length === 0) {
        logger.info('imap', 'Aucun email non lu trouvé');
        return { created: 0, ignored: 0 };
      }

      logger.info('imap', `${unseenUids.length} email(s) non lu(s) trouvé(s)`);

      /** Représente un message collecté pendant le fetch, en attente de traitement */
      interface CollectedMessage {
        uid: number;
        subject: string;
        source: string;
      }

      // Phase 1 : collecte de tous les messages AVANT toute opération d'écriture.
      // Appeler messageDelete/messageFlagsAdd PENDANT un fetch actif peut provoquer
      // des erreurs de protocole sur certains serveurs IMAP (notamment OVH).
      const collected: CollectedMessage[] = [];
      for await (const message of client.fetch(unseenUids, {
        envelope: true,
        source: true,
      }, { uid: true })) {
        collected.push({
          uid: message.uid,
          subject: message.envelope?.subject ?? '',
          source: String(message.source ?? ''),
        });
      }

      // Phase 2 : traitement des messages collectés (insertion en base + images)
      for (const msg of collected) {
        const { uid, subject, source: rawSource } = msg;
        const upperSubject = subject.toUpperCase();
        const messageId = extractMessageId(rawSource);

        if (upperSubject.startsWith('[TODO]')) {
          // Cas [TODO] : crée une tâche en file d'attente
          // Déduplication : si cette tâche a déjà été importée (message_id connu), on l'ignore
          if (messageId) {
            const existingTask = db
              .prepare('SELECT id FROM tasks WHERE message_id = ?')
              .get(messageId);

            if (existingTask) {
              logger.info('imap', `Tâche déjà importée ignorée : message_id="${messageId}"`);
              ignored++;
              continue;
            }
          }

          // Extrait le titre en supprimant le tag [TODO] du début du sujet
          const cleanTitle = subject.slice('[TODO]'.length).trim() || subject;
          const description = extractTextBody(rawSource);

          try {
            const maxPos = (db
              .prepare(`SELECT COALESCE(MAX(position), 0) as max_pos FROM tasks WHERE board = 'waiting'`)
              .get() as { max_pos: number }).max_pos;

            const taskResult = db.prepare(`
              INSERT INTO tasks (title, description, status, board, position, source, message_id)
              VALUES (@title, @description, 'todo', 'waiting', @position, 'imap', @message_id)
            `).run({
              title: cleanTitle,
              description: description || null,
              position: maxPos + 1,
              message_id: messageId,
            });

            const taskId = Number(taskResult.lastInsertRowid);

            logger.info('imap', `Tâche créée en attente : id=${taskId}, titre="${cleanTitle}"`);

            // Extraction et sauvegarde des images présentes dans le mail
            const images = extractImagesFromMime(rawSource);
            if (images.length > 0) {
              const savedCount = saveImagesToTask(images, taskId);
              logger.info('imap', `${savedCount} image(s) sauvegardée(s) pour tâche id=${taskId}`);
            }

            created++;
          } catch (dbError) {
            logger.error('imap', `Erreur lors de la création de la tâche : ${(dbError as Error).message}`);
          }
        } else {
          // Cas liste : vérifie si le sujet correspond à une catégorie connue
          const parsed = parseSubject(subject, tagToCategory);

          if (!parsed) {
            logger.info('imap', `Email ignoré (pas de tag) : sujet="${subject}"`);
            ignored++;
          } else {
            const { category, cleanTitle } = parsed;

            // Déduplication : si cet email a déjà été importé (message_id connu), on l'ignore
            if (messageId) {
              const existing = db
                .prepare('SELECT id FROM list_items WHERE message_id = ?')
                .get(messageId);

              if (existing) {
                logger.info('imap', `Email déjà importé ignoré : message_id="${messageId}"`);
                ignored++;
                continue;
              }
            }

            const body = extractTextBody(rawSource);

            try {
              const result = db.prepare(`
                INSERT INTO list_items (category, title, description, source, message_id)
                VALUES (@category, @title, @description, 'imap', @message_id)
              `).run({
                category,
                title: cleanTitle,
                description: body || null,
                message_id: messageId,
              });

              const itemId = Number(result.lastInsertRowid);

              logger.info(
                'imap',
                `Item créé : id=${itemId}, catégorie="${category}", titre="${cleanTitle}"`
              );

              // Extraction et sauvegarde des images présentes dans le mail
              const images = extractImagesFromMime(rawSource);
              if (images.length > 0) {
                const savedCount = saveImagesToItem(images, itemId);
                logger.info('imap', `${savedCount} image(s) sauvegardée(s) pour item id=${itemId}`);
              }

              created++;
            } catch (dbError) {
              logger.error('imap', `Erreur lors de l'insertion en base : ${(dbError as Error).message}`);
            }
          }
        }

        // Phase 3 : action sur l'email une fois le fetch terminé et le traitement DB effectué
        try {
          await appliquerActionEmail(client, uid, processedAction, archiveFolder, subject);
        } catch (actionError) {
          logger.error(
            'imap',
            `Impossible d'appliquer l'action "${processedAction}" sur uid=${uid} : ${(actionError as Error).message}`
          );
          // La déduplication par message_id sert de filet de sécurité si l'action échoue
        }
      }
    } finally {
      lock.release();
    }

    return { created, ignored };
  } catch (error) {
    logger.error('imap', `Erreur de connexion ou de traitement : ${(error as Error).message}`);
    throw error;
  } finally {
    try {
      await client.logout();
      logger.info('imap', 'Déconnexion du serveur IMAP');
    } catch {
      // Ignore les erreurs lors de la déconnexion
    }
  }
}
