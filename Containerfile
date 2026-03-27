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

# Copie des fichiers statiques dans le dossier standalone :
# Next.js ne les inclut pas automatiquement dans l'output standalone.
RUN cp -r .next/static .next/standalone/.next/static && \
    if [ -d public ]; then cp -r public .next/standalone/public; fi

# Variables d'environnement de production
# HOSTNAME=0.0.0.0 est indispensable pour que le serveur soit accessible depuis l'exterieur.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# Port expose par le serveur Next.js
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
