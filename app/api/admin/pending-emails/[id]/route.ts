import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractImagesFromMime, saveImagesToItem } from '@/lib/imap';
import { logger } from '@/lib/logger';
import type { PendingEmail, ListCategory, ListItem } from '@/lib/types';

/**
 * DELETE /api/admin/pending-emails/[id]
 * Supprime définitivement un email en attente (ignorer sans créer de liste).
 */
export function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return params.then(({ id }) => {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const result = db.prepare('DELETE FROM pending_emails WHERE id = ?').run(numId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  });
}

/**
 * POST /api/admin/pending-emails/[id]/resolve
 * Crée la nouvelle liste (si inexistante) et ajoute l'email comme item de cette liste,
 * puis supprime l'email de la file d'attente.
 *
 * Corps attendu : { name: string, icon: string, categoryKey: string }
 *   - name        : nom d'affichage de la nouvelle liste (ex : "Gaming")
 *   - icon        : emoji de la liste (ex : "🎮")
 *   - categoryKey : clé interne normalisée (ex : "gaming")  -  si absente, dérivée de name
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  // Récupère l'email en attente
  const pending = db
    .prepare('SELECT * FROM pending_emails WHERE id = ?')
    .get(numId) as PendingEmail | undefined;

  if (!pending) {
    return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
  }

  let body: { name?: string; icon?: string; categoryKey?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Le nom de la liste est obligatoire' }, { status: 400 });
  }

  const icon = (body.icon ?? '📋').trim() || '📋';

  // Normalise la clé de catégorie : alphanumérique + underscore, minuscules
  const rawKey = (body.categoryKey ?? name).trim();
  const categoryKey = rawKey
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!categoryKey) {
    return NextResponse.json({ error: 'Clé de catégorie invalide' }, { status: 400 });
  }

  // Dérive le tag IMAP depuis le tag reçu (ex: "[GAMING]") ou depuis la clé
  const tag = pending.tag; // déjà normalisé en majuscules avec crochets

  try {
    let category: ListCategory;

    // Vérifie si une liste avec cette clé ou ce tag existe déjà
    const existing = db
      .prepare('SELECT * FROM list_categories WHERE category = ? OR tag = ?')
      .get(categoryKey, tag) as ListCategory | undefined;

    if (existing) {
      // Réutilise la liste existante
      category = existing;
    } else {
      // Crée la nouvelle catégorie
      const maxPos = (
        db.prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM list_categories').get() as { max_pos: number }
      ).max_pos;

      const result = db.prepare(`
        INSERT INTO list_categories (category, name, tag, icon, position)
        VALUES (@category, @name, @tag, @icon, @position)
      `).run({
        category: categoryKey,
        name,
        tag,
        icon,
        position: maxPos + 1,
      });

      category = db
        .prepare('SELECT * FROM list_categories WHERE id = ?')
        .get(result.lastInsertRowid) as ListCategory;
    }

    // Extrait le titre en supprimant le tag du sujet
    const cleanTitle = pending.subject.slice(pending.tag.length).trim() || pending.subject;

    // Crée l'item dans la liste (avec déduplication par message_id)
    const maxItemPos = (
      db.prepare(`
        SELECT COALESCE(MAX(position), 0) as max_pos FROM list_items WHERE category = ?
      `).get(category.category) as { max_pos: number }
    ).max_pos;

    const itemResult = db.prepare(`
      INSERT OR IGNORE INTO list_items (category, title, description, source, message_id, position)
      VALUES (@category, @title, @description, 'imap', @message_id, @position)
    `).run({
      category: category.category,
      title: cleanTitle,
      description: pending.body || null,
      message_id: pending.message_id,
      position: maxItemPos + 1,
    });

    const item = db
      .prepare('SELECT * FROM list_items WHERE id = ?')
      .get(itemResult.lastInsertRowid) as ListItem;

    // Supprime l'email de la file d'attente
    db.prepare('DELETE FROM pending_emails WHERE id = ?').run(numId);

    // Extrait et sauvegarde les PJ depuis la source MIME brute si disponible
    if (pending.raw_source && item) {
      const images = extractImagesFromMime(pending.raw_source);
      if (images.length > 0) {
        const saved = saveImagesToItem(images, item.id);
        logger.info('admin/pending-emails', `${saved}/${images.length} PJ sauvegardée(s) pour item id=${item.id}`);
      }
    }

    return NextResponse.json({ category, item });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
