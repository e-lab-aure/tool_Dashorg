# Image de base Node.js 20 sur Alpine Linux (legere et securisee)
FROM node:20-alpine

# Installation des dependances systeme necessaires :
# - git         : pour git pull automatique au demarrage via entrypoint.sh
# - python3, make, g++ : compilation des modules natifs (better-sqlite3)
# - libc6-compat : compatibilite binaires glibc sur Alpine (base musl)
RUN apk add --no-cache libc6-compat python3 make g++ git

# Repertoire de travail dans le conteneur
WORKDIR /app

# Copie du script d'entree et attribution des droits d'execution
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Variables d'environnement de production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Port expose par le serveur Next.js
EXPOSE 3000

# Point d'entree : git pull -> npm ci (si besoin) -> build -> start
ENTRYPOINT ["./entrypoint.sh"]
