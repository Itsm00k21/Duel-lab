export type RawCardImage = {
  id?: number;
  image_url?: string;
  image_url_small?: string;
  image_url_cropped?: string;
};

export type ImageMatch = "exact" | "listed-alt" | "passcode-fallback" | "none";

export type ResolvedCardImage = {
  imageId: number;
  match: ImageMatch;
  altImageIds: number[];
};

function urlHasId(url: string | undefined, id: number) {
  if (!url) return false;
  return url.includes(`/${id}.`) || url.includes(`/${id}/`) || url.endsWith(`/${id}`);
}

/**
 * Bind artwork to a card using YGOPRODeck card_images only.
 * Never guess from the card name.
 *
 * 1. Prefer the artwork whose passcode equals the card id.
 * 2. Else use a listed artwork whose URL contains that artwork id.
 * 3. Else fall back to the card passcode (many singles still resolve).
 */
export function resolveCardImage(
  cardId: number,
  images: RawCardImage[] | undefined,
): ResolvedCardImage | null {
  if (!Number.isFinite(cardId) || cardId <= 0) return null;

  const listed = (images ?? [])
    .map((img) => {
      const id = typeof img.id === "number" ? img.id : NaN;
      if (!Number.isFinite(id) || id <= 0) return null;
      const urlOk =
        urlHasId(img.image_url, id) ||
        urlHasId(img.image_url_small, id) ||
        urlHasId(img.image_url_cropped, id) ||
        (!img.image_url && !img.image_url_small && !img.image_url_cropped);
      if (!urlOk) return null;
      return id;
    })
    .filter((id): id is number => id != null);

  const uniqueAlts = [...new Set(listed.filter((id) => id !== cardId))];

  if (listed.includes(cardId)) {
    return { imageId: cardId, match: "exact", altImageIds: uniqueAlts };
  }

  if (listed.length > 0) {
    return { imageId: listed[0], match: "listed-alt", altImageIds: uniqueAlts.filter((id) => id !== listed[0]) };
  }

  return { imageId: cardId, match: "passcode-fallback", altImageIds: [] };
}

export function cardImageSrc(imageId: number | undefined, size: "small" | "full" = "small") {
  if (!imageId) return null;
  return `/api/cards/image/${imageId}?size=${size}`;
}
