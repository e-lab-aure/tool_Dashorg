'use client';

import { useState, useCallback } from 'react';
import type { ListItemImage } from '@/lib/types';

interface ImageThumbnailsProps {
  images: ListItemImage[];
  itemId: number;
}

/**
 * Affiche les miniatures des images avec un popup intégré au clic.
 * Un second clic sur la même miniature (ou sur le fond sombre) ferme le popup.
 * @param images - Liste des images de l'item
 * @param itemId - Identifiant de l'item parent
 */
export default function ImageThumbnails({ images, itemId }: ImageThumbnailsProps) {
  const [openId, setOpenId] = useState<number | null>(null);

  /** Bascule le popup : ouvre l'image cliquée, ferme si déjà ouverte. */
  const handleThumbnailClick = useCallback((imgId: number) => {
    setOpenId((prev) => (prev === imgId ? null : imgId));
  }, []);

  const openImage = images.find((img) => img.id === openId);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => handleThumbnailClick(img.id)}
            title={img.filename}
            className={`w-12 h-12 rounded overflow-hidden border-2 transition-colors shrink-0 ${
              openId === img.id
                ? 'border-blue-500'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/lists/${itemId}/images/${img.id}`}
              alt={img.filename}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Popup lightbox  -  fond sombre cliquable pour fermer */}
      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setOpenId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={openImage.filename}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/lists/${itemId}/images/${openImage.id}`}
            alt={openImage.filename}
            className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpenId(null)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors flex items-center justify-center text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
