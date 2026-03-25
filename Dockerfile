# ============================================================
# Etape 1 : Installation des dependances
# Utilise les outils de compilation necessaires pour les
# modules natifs (better-sqlite3 necessite python, make, g++).
# ============================================================
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

# ============================================================
# Etape 2 : Build de l'application Next.js
# ============================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Le build n'a pas besoin des secrets IMAP — uniquement les
# variables NEXT_PUBLIC_* sont integrees a la compilation.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============================================================
# Etape 3 : Image de production minimale (standalone)
# Le mode standalone de Next.js produit un serveur node autonome
# sans avoir besoin de reinstaller toutes les dependances.
# ============================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Utilisateur non-root pour limiter la surface d'attaque
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Fichiers statiques publics
COPY --from=builder /app/public ./public

# Build standalone genere par Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Module natif better-sqlite3 compile pour l'architecture cible
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Repertoire de donnees SQLite — sera monte en volume Docker
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
