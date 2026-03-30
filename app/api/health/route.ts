/**
 * @module api/health
 * @description Endpoint de sante applicative.
 * Utilise par les orchestrateurs (Podman, Docker, Kubernetes) et les load balancers
 * pour verifier que l'application est demarree et la base de donnees accessible.
 * GET /api/health -> 200 OK si tout va bien, 503 Service Unavailable sinon
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Structure de la reponse de sante */
interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime_seconds: number;
  database: 'ok' | 'error';
  timestamp: string;
}

/** Heure de demarrage du process, pour calculer l'uptime */
const startedAt = Date.now();

/**
 * Verifie l'etat de sante de l'application.
 * Teste la connexion a la base de donnees avec une requete legere.
 * @returns JSON avec statut, version, uptime et etat de la BDD
 */
export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  const uptime_seconds = Math.floor((Date.now() - startedAt) / 1000);
  const version = process.env.npm_package_version ?? '1.0.0';

  let databaseStatus: 'ok' | 'error' = 'ok';

  try {
    // Requete minimale pour verifier que la BDD repond
    db.prepare('SELECT 1').get();
  } catch (err) {
    databaseStatus = 'error';
    logger.error('api/health', `Base de donnees inaccessible : ${(err as Error).message}`);
  }

  const overall: 'ok' | 'degraded' = databaseStatus === 'ok' ? 'ok' : 'degraded';

  const body: HealthResponse = {
    status: overall,
    version,
    uptime_seconds,
    database: databaseStatus,
    timestamp,
  };

  // Retourne 503 si la BDD est inaccessible pour que le load balancer exclue ce noeud
  const httpStatus = overall === 'ok' ? 200 : 503;

  return NextResponse.json(body, { status: httpStatus });
}
