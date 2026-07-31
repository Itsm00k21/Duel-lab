export type BanStatus = "Banned" | "Limited" | "Semi-Limited" | string;

export type CompactCard = {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race?: string;
  attribute?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  archetype?: string;
  banTcg?: string;
  banOcg?: string;
  banGoat?: string;
  /** Master Duel Forbidden/Limited overlay. */
  banMd?: string;
  formats?: string[];
  tcgDate?: string;
  ocgDate?: string;
  treatedAs?: string;
  hasEffect?: boolean;
  genesys?: number;
  /** Artwork passcode from YGOPRODeck card_images, cross-checked to this card. */
  imageId?: number;
  imageMatch?: "exact" | "listed-alt" | "passcode-fallback" | "none";
  altImageIds?: number[];
};

export type CardDbVersion = {
  database_version: string;
  last_update: string;
};

export type SyncMeta = {
  version: string;
  lastUpdate: string;
  syncedAt: string;
  count: number;
  imageExact?: number;
  imageAlt?: number;
  imageFallback?: number;
};
