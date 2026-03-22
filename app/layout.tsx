/**
 * @module layout
 * @description Layout racine de l'application Dashorg.
 * Initialise les jobs cron au démarrage, applique le dark mode par défaut
 * et définit les métadonnées de la page.
 */

// Initialisation des crons au démarrage du serveur (Server Component)
import '@/lib/cron';

import type { Metadata } from 'next';
import './globals.css';

/** Titre de l'application depuis les variables d'environnement */
const appTitle = process.env.NEXT_PUBLIC_APP_TITLE ?? 'Dashorg';

export const metadata: Metadata = {
  title: appTitle,
  description: 'Dashboard personnel self-hosted — Dashorg',
};

/** Props du layout racine */
interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout racine de l'application.
 * Le mode clair est activé par défaut. Le basculement dark/light est géré côté client.
 * @param children - Contenu de la page
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="fr">
      <body className="bg-gray-100 dark:bg-gray-950 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
