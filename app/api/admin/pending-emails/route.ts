import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { PendingEmail } from '@/lib/types';

/**
 * GET /api/admin/pending-emails
 * Retourne tous les emails en attente (tag non reconnu), du plus récent au plus ancien.
 */
export function GET() {
  const rows = db
    .prepare('SELECT * FROM pending_emails ORDER BY created_at DESC')
    .all() as PendingEmail[];
  return NextResponse.json(rows);
}
