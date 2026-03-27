# Image de base Node.js 20 Debian slim (meilleure compatibilite pour better-sqlite3)
FROM node:20-slim

# Installation des dependances systeme pour compiler les modules natifs (better-sqlite3)
RUN apt-get update && apt-get install -y \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copie des manifestes en premier pour profiter du cache de couche Docker/Podman :
# si package.json et package-lock.json n'ont pas change, npm ci n'est pas reexecute.
COPY package*.json ./
RUN npm ci

# Copie du reste du projet et build de production
COPY . .
RUN npm run build

# Variables d'environnement de production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Port expose par le serveur Next.js
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
