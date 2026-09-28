import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/** What the check-in screen sends. Amounts are in `currency`. */
export interface CheckinInput {
  userHustleId: string;
  /** Mood 1 (drained) … 5 (on fire). */
  feeling: number | null;
  revenue: number;
  costs: number;
  currency: string;
  hours: number | null;
  /** The hustle's weekly metrics, e.g. { sales: 3, listings: 24 }. */
  metrics: Record<string, number>;
  /** Energy 1–10. */
  motivation: number | null;
  blockers: string;
  nextWeekPlan: string;
  /** Up to 5 screenshots picked on the phone (not uploaded yet). */
  screenshots: PickedImage[];
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
}

export const MAX_SCREENSHOTS = 5;
const MAX_SIDE = 1600;

/** Opens the photo library. Returns [] if the user cancels. */
export async function pickScreenshots(remaining: number): Promise<PickedImage[]> {
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map((a) => ({ uri: a.uri, width: a.width, height: a.height, fileName: a.fileName }));
}

// Base64 → bytes without relying on atob (not available everywhere).
const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  table['-'.charCodeAt(0)] = 62;
  table['_'.charCodeAt(0)] = 63;
  return table;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const out = new Uint8Array(Math.ceil((b64.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let n = 0;
  for (let i = 0; i < b64.length; i++) {
    const code = b64.charCodeAt(i);
    const v = code < 128 ? LOOKUP[code] : -1;
    if (v < 0) continue;
    buffer = ((buffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

/** Shrinks a screenshot to at most 1600 px on the long side, as JPEG. */
async function toJpegBytes(image: PickedImage): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > MAX_SIDE) {
    context.resize(image.width >= image.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error('image_encode_failed');
  return base64ToBytes(saved.base64);
}

/**
 * Uploads screenshots to the private "checkins" bucket under
 * <user id>/<hustle id>/… and returns their paths. If one fails, the
 * already-uploaded ones are removed and the error is thrown.
 */
export async function uploadScreenshots(userId: string, userHustleId: string, week: number, images: PickedImage[]): Promise<string[]> {
  return uploadImages(`${userId}/${userHustleId}`, `week-${week}`, images);
}

/** Screenshots attached to a coach message (<user id>/coach/…). */
export async function uploadCoachImages(userId: string, images: PickedImage[]): Promise<string[]> {
  return uploadImages(`${userId}/coach`, 'chat', images);
}

async function uploadImages(folder: string, prefix: string, images: PickedImage[]): Promise<string[]> {
  if (!supabase || images.length === 0) return [];
  const paths: string[] = [];
  const stamp = Date.now();
  try {
    for (let i = 0; i < images.length; i++) {
      const bytes = await toJpegBytes(images[i]);
      const path = `${folder}/${prefix}-${stamp}-${i + 1}.jpg`;
      const { error } = await supabase.storage.from('checkins').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  } catch (e) {
    await removeScreenshots(paths);
    throw e;
  }
}

export async function removeScreenshots(paths: string[]): Promise<void> {
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from('checkins').remove(paths).catch(() => {});
}
