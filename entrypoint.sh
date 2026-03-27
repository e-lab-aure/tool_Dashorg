#!/bin/sh
# Point d'entree du conteneur Dashorg.
# Sequence au demarrage : npm ci (si besoin) -> build -> start
# Le git pull est gere en amont par deploy.sh sur le serveur.

set -e

log() { echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"; }

# --- Installation des dependances si package-lock.json a change ---
# Compare le hash avec celui enregistre lors du dernier npm ci.
LOCK_HASH_FILE="/tmp/.npm_lock_hash"
CURRENT_HASH=$(md5sum package-lock.json | cut -d' ' -f1)

if [ ! -f "$LOCK_HASH_FILE" ] || [ "$(cat $LOCK_HASH_FILE)" != "$CURRENT_HASH" ]; then
  log "Reinstallation des dependances..."
  npm ci
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
else
  log "Dependances a jour."
fi

# --- Build Next.js ---
log "Build de l'application..."
npm run build

# --- Demarrage du serveur ---
log "Demarrage de Dashorg..."
exec node .next/standalone/server.js
