'use client';

/**
 * @module EmojiPickerButton
 * @description Bouton affichant l'emoji sélectionné et ouvrant un sélecteur d'emojis
 * au clic. Utilise emoji-mart via import dynamique pour éviter les erreurs SSR sous Next.js.
 */

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';

/** Chargement dynamique du picker (côté client uniquement  -  évite les erreurs SSR) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Picker = dynamic(() => import('@emoji-mart/react'), { ssr: false }) as React.ComponentType<any>;

/** Props du composant EmojiPickerButton */
interface EmojiPickerButtonProps {
  /** Emoji actuellement sélectionné */
  value: string;
  /** Callback déclenché à la sélection d'un nouvel emoji */
  onChange: (emoji: string) => void;
}

/** Structure retournée par emoji-mart lors de la sélection */
interface EmojiMartSelection {
  native: string;
}

/**
 * Bouton-emoji qui ouvre/ferme un sélecteur d'emojis en popover.
 * Cliquer en dehors du popover le ferme automatiquement.
 * @param value - Emoji affiché sur le bouton
 * @param onChange - Appelé avec le nouvel emoji natif à chaque sélection
 */
export default function EmojiPickerButton({ value, onChange }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Ferme le popover si le clic se produit en dehors du composant.
   */
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  /**
   * Gère la sélection d'un emoji depuis le picker.
   * @param selection - Objet retourné par emoji-mart
   */
  function handleSelect(selection: EmojiMartSelection): void {
    onChange(selection.native);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Bouton affichant l'emoji courant */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Choisir un emoji"
        className="w-10 h-10 text-xl rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
      >
        {value}
      </button>

      {/* Popover du picker  -  positionné en bas à gauche du bouton */}
      {open && (
        <div className="absolute top-12 left-0 z-50 shadow-2xl rounded-xl overflow-hidden">
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            locale="fr"
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}
    </div>
  );
}
