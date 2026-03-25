#!/bin/sh
# Point d'entree du conteneur Dashorg.
# Sequence au demarrage : git pull -> npm ci (si besoin) -> build -> start

set -e

log() {
  echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

error() {
  echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

# --- Mise a jour du code source via Git ---
log "Recuperation des dernieres modifications Git..."
if ! git pull --ff-only; then
  error "git pull a echoue. Verifiez la connexion ou les conflits."
  exit 1
fi

# --- Installation des dependances si package.json a change ---
# Compare le hash du package-lock.json avec celui enregistre lors du dernier npm ci.
LOCK_HASH_FILE="/tmp/.npm_lock_hash"
CURRENT_HASH=$(md5sum package-lock.json | cut -d' ' -f1)

if [ ! -f "$LOCK_HASH_FILE" ] || [ "$(cat $LOCK_HASH_FILE)" != "$CURRENT_HASH" ]; then
  log "package-lock.json a change — reinstallation des dependances..."
  npm ci
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
else
  log "Dependances a jour, installation ignoree."
fi

# --- Build Next.js ---
log "Build de l'application..."
npm run build

# --- Demarrage du serveur ---
log "Demarrage de Dashorg..."
exec node .next/standalone/server.js
