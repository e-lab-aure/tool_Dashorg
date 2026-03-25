# Image de base avec les outils necessaires pour :
# - compiler better-sqlite3 (python3, make, g++)
# - cloner/mettre a jour le depot Git (git)
FROM node:20-alpine

RUN apk add --no-cache libc6-compat python3 make g++ git

WORKDIR /app

# Le code source est monte via un volume depuis le NAS.
# Ce script est le seul point d'entree : il met a jour le code,
# installe les dependances si necessaire, build et demarre.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
