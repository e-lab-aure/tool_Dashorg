'use client';

/**
 * @module FlipClock
 * @description Affichage de l'heure en temps réel avec animation split-flap (tableau départ).
 * Chaque chiffre se retourne individuellement quand sa valeur change.
 * La date du jour est affichée sous l'horloge en typographie légère.
 */

import { useState, useEffect, useRef } from 'react';

// ── Constantes visuelles ────────────────────────────────────────────
/** Hauteur totale d'une carte chiffre en pixels */
const CARD_H = 54;
/** Largeur d'une carte chiffre en pixels */
const CARD_W = 38;
/** Taille de police du chiffre */
const FONT_SIZE = 34;
/** Durée totale du cycle d'animation (doit être ≥ delay + duration de flap-bottom-in) */
const ANIM_TOTAL_MS = 360;

// ── Styles partagés calculés depuis les constantes ──────────────────
const halfH = CARD_H / 2;

/** Style commun des demi-cartes */
const halfBase: React.CSSProperties = {
  position: 'absolute',
  width: '100%',
  height: `${halfH}px`,
  overflow: 'hidden',
  backfaceVisibility: 'hidden',
};

/** Style du texte chiffre dans la moitié haute (on voit la partie haute du glyphe) */
const digitUpperStyle: React.CSSProperties = {
  position: 'absolute',
  width: '100%',
  height: `${CARD_H}px`,
  lineHeight: `${CARD_H}px`,
  top: 0,
  textAlign: 'center',
  fontSize: `${FONT_SIZE}px`,
  fontWeight: '700',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: '"SF Mono", ui-monospace, "Cascadia Code", monospace',
  color: '#e8eaf0',
  letterSpacing: '-1px',
  userSelect: 'none',
};

/** Style du texte chiffre dans la moitié basse (on remonte le glyphe pour voir sa partie basse) */
const digitLowerStyle: React.CSSProperties = {
  ...digitUpperStyle,
  top: `-${halfH}px`,
};

// ── Composant FlipDigit ─────────────────────────────────────────────

interface FlipDigitProps {
  /** Caractère à afficher (chiffre ou séparateur) */
  value: string;
}

/**
 * Carte flip pour un seul caractère.
 * Maintient un état prev/curr et déclenche l'animation CSS quand value change.
 * @param value - Nouvelle valeur à afficher
 */
function FlipDigit({ value }: FlipDigitProps) {
  // Valeur actuellement "committée" dans les calques statiques
  const [curr, setCurr] = useState(value);
  // Valeur précédente utilisée pendant l'animation
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;

    // Sauvegarde l'ancienne valeur avant de déclencher l'animation
    setPrev(prevRef.current);
    prevRef.current = value;
    setFlipping(true);

    // Une fois l'animation terminée, on stabilise curr sur la nouvelle valeur
    const t = setTimeout(() => {
      setCurr(value);
      setFlipping(false);
    }, ANIM_TOTAL_MS);

    return () => clearTimeout(t);
  }, [value]);

  // Pendant le flip :
  //   - calque statique haut  → nouvelle valeur (révélée quand le volet du dessus s'efface)
  //   - calque statique bas   → ancienne valeur (cachée derrière le volet du dessous)
  //   - volet haut animé     → ancienne valeur qui "tombe" vers le bas (0° → -90°)
  //   - volet bas animé      → nouvelle valeur qui "monte" depuis le bas (90° → 0°)
  const staticTop = flipping ? value : curr;
  const staticBot = curr; // toujours l'ancienne jusqu'à ce que l'animation finisse

  return (
    <div
      style={{
        position: 'relative',
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
        perspective: '240px',
        flexShrink: 0,
      }}
    >
      {/* ── Calques statiques ── */}
      {/* Moitié haute — révèle la nouvelle valeur quand le volet tombe */}
      <div
        style={{
          ...halfBase,
          top: 0,
          background: 'linear-gradient(180deg, #252b3b 0%, #1e2432 100%)',
          borderRadius: '5px 5px 0 0',
        }}
      >
        <div style={digitUpperStyle}>{staticTop}</div>
      </div>

      {/* Moitié basse — montre l'ancienne valeur jusqu'à ce que le volet du bas se déplie */}
      <div
        style={{
          ...halfBase,
          top: `${halfH}px`,
          background: 'linear-gradient(180deg, #191e2c 0%, #161b28 100%)',
          borderRadius: '0 0 5px 5px',
        }}
      >
        <div style={digitLowerStyle}>{staticBot}</div>
      </div>

      {/* ── Volets animés (visibles uniquement pendant le flip) ── */}
      {flipping && (
        <>
          {/* Volet haut : ancienne valeur qui tombe (0° → -90°) */}
          <div
            className="flap-top-out"
            style={{
              ...halfBase,
              top: 0,
              background: 'linear-gradient(180deg, #2d3448 0%, #252b3b 100%)',
              borderRadius: '5px 5px 0 0',
              zIndex: 4,
            }}
          >
            <div style={digitUpperStyle}>{prev}</div>
          </div>

          {/* Volet bas : nouvelle valeur qui monte (90° → 0°) */}
          <div
            className="flap-bottom-in"
            style={{
              ...halfBase,
              top: `${halfH}px`,
              background: 'linear-gradient(180deg, #191e2c 0%, #161b28 100%)',
              borderRadius: '0 0 5px 5px',
              zIndex: 4,
              transform: 'rotateX(90deg)', // état initial avant que l'animation CSS prenne la main
            }}
          >
            <div style={digitLowerStyle}>{value}</div>
          </div>
        </>
      )}

      {/* Ligne centrale (charnière visuelle) */}
      <div
        style={{
          position: 'absolute',
          top: `${halfH - 1}px`,
          left: 0,
          right: 0,
          height: '2px',
          background: '#0c1018',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ── Séparateur (:) entre groupes ─────────────────────────────────────

/**
 * Séparateur visuel entre les groupes heures:minutes:secondes.
 */
function Separator() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '10px',
        height: `${CARD_H}px`,
        paddingBottom: '2px',
        flexShrink: 0,
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: '#3d4560',
          }}
        />
      ))}
    </div>
  );
}

// ── Groupe de deux chiffres ───────────────────────────────────────────

interface DigitGroupProps {
  /** Nombre à deux chiffres (ex: "07", "42") */
  value: string;
}

/**
 * Affiche deux cartes flip côte à côte pour un groupe heures/minutes/secondes.
 * @param value - Chaîne de deux caractères
 */
function DigitGroup({ value }: DigitGroupProps) {
  const d0 = value[0] ?? '0';
  const d1 = value[1] ?? '0';
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      <FlipDigit value={d0} />
      <FlipDigit value={d1} />
    </div>
  );
}

// ── Composant principal FlipClock ─────────────────────────────────────

/**
 * Affiche l'heure courante sous forme de tableau split-flap et la date du jour en dessous.
 * Met à jour l'affichage toutes les secondes.
 */
export default function FlipClock() {
  const [now, setNow] = useState<Date | null>(null);

  // Évite les erreurs d'hydratation SSR en n'initialisant qu'au montage côté client
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    // Placeholder pendant l'hydratation (dimensions identiques pour éviter le layout shift)
    return <div style={{ height: `${CARD_H + 22}px`, width: '200px' }} />;
  }

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // Date formatée en français (ex : "lundi 21 juillet 2025")
  const dateLabel = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      {/* ── Affichage de l'heure ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <DigitGroup value={hh} />
        <Separator />
        <DigitGroup value={mm} />
        <Separator />
        <DigitGroup value={ss} />
      </div>

      {/* ── Date du jour ── */}
      <p
        style={{
          fontSize: '10px',
          fontWeight: '500',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#4a5270',
          margin: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {dateLabel}
      </p>
    </div>
  );
}
