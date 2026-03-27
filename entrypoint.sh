#!/bin/sh
# Point d'entree du conteneur Dashorg.
# Le build est effectue au moment de la construction de l'image (Containerfile).
# Ce script se contente de demarrer le serveur.

set -e

log() { echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"; }

log "Demarrage de Dashorg..."
exec node .next/standalone/server.js
