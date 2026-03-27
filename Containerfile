# Image de base Node.js 20 sur Alpine Linux (legere et securisee)
FROM node:20-alpine

# Installation des dependances systeme necessaires :
# - python3, make, g++ : compilation des modules natifs (better-sqlite3)
# - libc6-compat : compatibilite binaires glibc sur Alpine (base musl)
RUN apk add --no-cache libc6-compat python3 make g++

# Repertoire de travail dans le conteneur
WORKDIR /app

# Copie du script d'entree et attribution des droits d'execution
COPY entrypoint.sh ./entrypoint.sh
RUN chmod 755 ./entrypoint.sh

# Copie de tout le projet (node_modules, .git, .next, .env exclus via .containerignore)
COPY . .

# Variables d'environnement de production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Port expose par le serveur Next.js
EXPOSE 3000

# Point d'entree : npm ci (si besoin) -> build -> start
ENTRYPOINT ["./entrypoint.sh"]
