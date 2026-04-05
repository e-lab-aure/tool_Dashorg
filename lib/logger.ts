/**
 * @module logger
 * @description Utilitaire de journalisation centralise.
 * Formate les messages selon le standard : [LEVEL] YYYY-MM-DD HH:MM:SS - contexte - message
 * Conserve en mémoire les 50 dernières entrées (buffer global, résilient aux hot-reloads).
 */

/** Niveaux de log disponibles */
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/** Entrée de log structurée */
export interface LogEntry {
  id: number;
  level: LogLevel;
  context: string;
  message: string;
  timestamp: string;
}

const MAX_LOGS = 50;

// Utilise l'objet global pour survivre aux hot-reloads Next.js en développement
const BUFFER_KEY = '__dashorgLogBuffer';
const COUNTER_KEY = '__dashorgLogCounter';
const globalObj = global as Record<string, unknown>;

function getBuffer(): LogEntry[] {
  if (!Array.isArray(globalObj[BUFFER_KEY])) {
    globalObj[BUFFER_KEY] = [];
  }
  return globalObj[BUFFER_KEY] as LogEntry[];
}

function nextId(): number {
  if (typeof globalObj[COUNTER_KEY] !== 'number') {
    globalObj[COUNTER_KEY] = 0;
  }
  return ++((globalObj[COUNTER_KEY] as number));
}

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
 * Écrit dans la console ET dans le buffer en mémoire.
 * @param level - Niveau de sévérité du log
 * @param context - Module ou composant à l'origine du log
 * @param message - Message descriptif de l'événement
 */
function log(level: LogLevel, context: string, message: string): void {
  const timestamp = formatTimestamp();
  const formatted = `[${level}] ${timestamp} - ${context} - ${message}`;

  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(formatted);
  } else if (level === 'WARNING') {
    console.warn(formatted);
  } else {
    console.info(formatted);
  }

  // Ajout au buffer circulaire - les entrées les plus anciennes sont supprimées au-delà de MAX_LOGS
  const buffer = getBuffer();
  buffer.push({ id: nextId(), level, context, message, timestamp });
  if (buffer.length > MAX_LOGS) {
    buffer.splice(0, buffer.length - MAX_LOGS);
  }
}

/**
 * Retourne une copie des logs actuellement en mémoire, du plus ancien au plus récent.
 */
export function getLogs(): LogEntry[] {
  return [...getBuffer()];
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
