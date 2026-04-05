import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/logger';

/**
 * GET /api/admin/logs
 * Retourne les 50 dernières entrées du buffer de logs en mémoire.
 */
export function GET() {
  return NextResponse.json(getLogs());
}
