'use client';

/**
 * @module LinkedText
 * @description Composant utilitaire qui détecte les URLs dans un texte brut
 * et les transforme en liens hypertexte cliquables s'ouvrant dans un nouvel onglet.
 * Les parties non-URL sont affichées comme du texte simple.
 */

import React from 'react';

/** Props du composant LinkedText */
interface LinkedTextProps {
  /** Texte brut pouvant contenir des URLs */
  text: string;
  /** Classes CSS à appliquer sur le conteneur */
  className?: string;
}

/** Expression régulière de détection des URLs (http/https/ftp) */
const URL_REGEX = /(https?:\/\/|ftp:\/\/)[^\s<>"']+/gi;

/**
 * Découpe un texte en segments textuels et URL, et affiche les URL en liens.
 * Chaque lien s'ouvre dans un nouvel onglet avec rel="noopener noreferrer".
 * @param text - Texte brut à analyser
 * @param className - Classes CSS optionnelles pour le span racine
 */
export default function LinkedText({ text, className }: LinkedTextProps) {
  // Découpe le texte en alternant segments texte et URL
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(URL_REGEX.source, 'gi');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'url', value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'url' ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline break-all"
          >
            {part.value}
          </a>
        ) : (
          <React.Fragment key={i}>{part.value}</React.Fragment>
        )
      )}
    </span>
  );
}
