/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permet l'utilisation de modules Node.js natifs cote serveur (better-sqlite3, fs, etc.)
  // Mode standalone : produit un build autonome minimal et autosuffisant
  output: 'standalone',
};

export default nextConfig;
