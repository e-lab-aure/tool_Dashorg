/**
 * @module config
 * @description Configuration centralisee de l'application Dashorg.
 * Tous les chemins et parametres d'environnement critiques sont definis ici
 * pour eviter la duplication et faciliter le deploiement.
 */

import path from 'path';

/**
 * Chemin absolu vers le fichier SQLite.
 * Priorite : variable d'environnement DB_PATH, sinon valeur par defaut selon NODE_ENV.
 */
export const DB_PATH: string =
  process.env.DB_PATH ??
  (process.env.NODE_ENV === 'production'
    ? '/app/data/dashorg.db'
    : path.join(process.cwd(), 'data', 'dashorg.db'));

/**
 * Repertoire racine des fichiers uploades (pieces jointes et images).
 * Priorite : variable d'environnement UPLOADS_ROOT, sinon valeur par defaut selon NODE_ENV.
 */
export const UPLOADS_ROOT: string =
  process.env.UPLOADS_ROOT ??
  (process.env.NODE_ENV === 'production'
    ? '/app/uploads'
    : path.join(process.cwd(), 'uploads'));

/** Sous-repertoire des images liees aux items de liste */
export const LISTS_UPLOADS_BASE: string = path.join(UPLOADS_ROOT, 'lists');

/** Sous-repertoire des pieces jointes liees aux taches */
export const TASKS_UPLOADS_BASE: string = path.join(UPLOADS_ROOT, 'tasks');

/**
 * Longueur maximale autorisee pour un titre (tache ou item de liste).
 * Protege contre les saisies anormalement longues.
 */
export const TITLE_MAX_LENGTH = 200;

/**
 * Longueur maximale autorisee pour une description.
 */
export const DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Taille maximale d'un fichier uploade en octets (10 Mo).
 * Appliquee lors des uploads manuels via l'interface.
 */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Nombre maximum d'articles RSS conserves par flux.
 * Les articles les plus anciens sont supprimes lors du nettoyage periodique.
 */
export const RSS_MAX_ARTICLES_PER_FEED = 500;
