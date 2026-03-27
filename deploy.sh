#!/bin/bash
# Script de deploiement Dashorg sur le serveur Ubuntu.
# Usage : ./deploy.sh
# Sequence : git pull -> stop/rm conteneur -> build image -> run conteneur

set -e

REPO_DIR="/opt/tool_Dashorg"
CONTAINER_NAME="tool_dashorg"
IMAGE_NAME="tool_dashorg:latest"
DATA_DIR="$REPO_DIR/data"
ENV_FILE="$REPO_DIR/.env"

log()   { echo "[INFO]  $(date '+%Y-%m-%d %H:%M:%S') - $1"; }
error() { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2; }

# --- Verification des prerequis ---
if [ ! -f "$ENV_FILE" ]; then
  error "Fichier .env introuvable : $ENV_FILE"
  error "Copiez .env.example en .env et remplissez les valeurs."
  exit 1
fi

# --- Mise a jour du code source ---
log "Mise a jour du code source..."
cd "$REPO_DIR"
if ! git pull --ff-only; then
  error "git pull a echoue. Verifiez la connexion ou les conflits."
  exit 1
fi

# --- Arret et suppression de l'ancien conteneur ---
log "Arret du conteneur en cours..."
podman stop "$CONTAINER_NAME" 2>/dev/null || true
podman rm   "$CONTAINER_NAME" 2>/dev/null || true

# --- Build de la nouvelle image ---
log "Build de l'image Podman..."
podman build -f Containerfile -t "$IMAGE_NAME" .

# --- Demarrage du nouveau conteneur ---
# Le volume data assure la persistence de la base SQLite entre les deployments.
mkdir -p "$DATA_DIR"
log "Demarrage du conteneur..."
podman run -d \
  --name "$CONTAINER_NAME" \
  -p 3000:3000 \
  -v "$DATA_DIR:/app/data" \
  --env-file "$ENV_FILE" \
  "$IMAGE_NAME"

log "Deploye avec succes. Dashorg disponible sur le port 3000."
