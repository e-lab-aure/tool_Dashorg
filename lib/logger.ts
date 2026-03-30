/**
 * @module logger
 * @description Utilitaire de journalisation centralise.
 * Formate les messages selon le standard : [LEVEL] YYYY-MM-DD HH:MM:SS - contexte - message
 */

/** Niveaux de log disponibles */
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Formate et retourne l'horodatage actuel au format ISO local.
 * @returns Chaîne de date formatée YYYY-MM-DD HH:MM:SS
 */
function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Journalise un message avec le niveau, le contexte et l'horodatage.
 * @param level - Niveau de sévérité du log
 * @param context - Module ou composant à l'origine du log
 * @param message - Message descriptif de l'événement
 */
function log(level: LogLevel, context: string, message: string): void {
  const entry = `[${level}] ${formatTimestamp()} - ${context} - ${message}`;

  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(entry);
  } else if (level === 'WARNING') {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

export const logger = {
  /** Log de niveau DEBUG - informations de diagnostic detaillees */
  debug: (context: string, message: string) => log('DEBUG', context, message),
  /** Log de niveau INFO - operations normales */
  info: (context: string, message: string) => log('INFO', context, message),
  /** Log de niveau WARNING - evenements inattendus mais recuperables */
  warning: (context: string, message: string) => log('WARNING', context, message),
  /** Log de niveau ERROR - echecs necessitant attention */
  error: (context: string, message: string) => log('ERROR', context, message),
  /** Log de niveau CRITICAL - echecs systeme graves */
  critical: (context: string, message: string) => log('CRITICAL', context, message),
};
