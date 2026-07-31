import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const IMAGE_DIR = path.join(process.cwd(), "data", "cache", "images");
export const IMAGE_INDEX_FILE = path.join(process.cwd(), "data", "cache", "image-index.json");

export type ImageIndexEntry = {
  cardId: number;
  name: string;
  imageId: number;
  match: string;
  altImageIds?: number[];
};

export type ImageIndex = {
  schema: number;
  builtAt: string;
  byCardId: Record<string, ImageIndexEntry>;
  allowedImageIds: number[];
};

const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_WEBP = Buffer.from("WEBP");

export function isLikelyImage(buf: Buffer) {
  if (buf.length < 12) return false;
  if (buf.subarray(0, 3).equals(JPEG_SOI.subarray(0, 3))) return true;
  if (buf.subarray(0, 4).equals(PNG_SIG)) return true;
  if (buf.subarray(0, 4).equals(WEBP_RIFF) && buf.subarray(8, 12).equals(WEBP_WEBP)) return true;
  return false;
}

export function imagePath(imageId: number, size: "small" | "full") {
  return path.join(IMAGE_DIR, size, `${imageId}.img`);
}

export async function readImageIndex(): Promise<ImageIndex | null> {
  try {
    return JSON.parse(await readFile(IMAGE_INDEX_FILE, "utf8")) as ImageIndex;
  } catch {
    return null;
  }
}

export async function writeImageIndex(index: ImageIndex) {
  await mkdir(path.dirname(IMAGE_INDEX_FILE), { recursive: true });
  await writeFile(IMAGE_INDEX_FILE, JSON.stringify(index));
}

export function remoteImageUrl(imageId: number, size: "small" | "full") {
  if (size === "small") return `https://images.ygoprodeck.com/images/cards_small/${imageId}.jpg`;
  return `https://images.ygoprodeck.com/images/cards/${imageId}.jpg`;
}

export async function loadOrFetchImage(
  imageId: number,
  size: "small" | "full",
  allowed?: Set<number>,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!Number.isInteger(imageId) || imageId <= 0) return null;
  if (allowed && !allowed.has(imageId)) return null;

  const file = imagePath(imageId, size);
  try {
    const cached = await readFile(file);
    if (isLikelyImage(cached)) {
      return { bytes: cached, contentType: contentTypeOf(cached) };
    }
  } catch {
    // miss
  }

  const url = remoteImageUrl(imageId, size);
  const res = await fetch(url, {
    headers: { Accept: "image/jpeg,image/png,image/webp,image/*" },
    cache: "force-cache",
  });
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!isLikelyImage(bytes)) return null;

  // Cross-check: URL path must be this passcode.
  if (!url.includes(`/${imageId}.jpg`)) return null;

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return { bytes, contentType: contentTypeOf(bytes) };
}

function contentTypeOf(buf: Buffer) {
  if (buf.subarray(0, 4).equals(PNG_SIG)) return "image/png";
  if (buf.subarray(0, 4).equals(WEBP_RIFF)) return "image/webp";
  return "image/jpeg";
}
