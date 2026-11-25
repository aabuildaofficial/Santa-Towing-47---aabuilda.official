// Santa Towing Image Studio & Library Storage
// IndexedDB persistence with memory fallback for high-capacity media assets.
import {
  towingVehicleFlatbed,
  heavyDutyRecoveryVehicle,
  suvKiaSportage2024,
  santaLogo,
} from '@/assets/images';
import { safeJsonParse, sanitizeImageUrl } from '@/lib/security';
import { supabase, isSupabaseConfigured, hasSupabaseAuthSession } from './supabase';

export type ImageCategory = 'Fleet' | 'Towing' | 'Haulage' | 'Garage' | 'Documents' | 'General';
export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface StudioImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  format: ImageFormat;
  size: number; // in bytes
  category: ImageCategory;
  isEdited: boolean;
  originalId?: string;
  originalName?: string;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'santa_image_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'studio_images';
const FALLBACK_KEY = 'santa_studio_images_fallback_v1';

// Seed starter images from site photography
const SEED_IMAGES: Omit<StudioImage, 'dataUrl'>[] = [
  {
    id: 'seed-img-1',
    name: 'Santa Heavy Duty Towing Truck',
    width: 1200,
    height: 800,
    format: 'image/jpeg',
    size: 245000,
    category: 'Fleet',
    isEdited: false,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    id: 'seed-img-2',
    name: 'Excavator Heavy Equipment Haulage',
    width: 1200,
    height: 800,
    format: 'image/jpeg',
    size: 312000,
    category: 'Haulage',
    isEdited: false,
    createdAt: '2026-10-21T11:30:00.000Z',
    updatedAt: '2026-10-21T11:30:00.000Z',
  },
  {
    id: 'seed-img-3',
    name: 'Accident Scene Hydraulic Recovery',
    width: 1200,
    height: 800,
    format: 'image/jpeg',
    size: 280000,
    category: 'Towing',
    isEdited: false,
    createdAt: '2026-10-22T08:15:00.000Z',
    updatedAt: '2026-10-22T08:15:00.000Z',
  },
  {
    id: 'seed-img-4',
    name: 'Santa Official Company Wordmark Logo',
    width: 600,
    height: 200,
    format: 'image/png',
    size: 48000,
    category: 'Documents',
    isEdited: false,
    createdAt: '2026-10-23T14:00:00.000Z',
    updatedAt: '2026-10-23T14:00:00.000Z',
  },
];

const SEED_URLS: Record<string, string> = {
  'seed-img-1': towingVehicleFlatbed,
  'seed-img-2': heavyDutyRecoveryVehicle,
  'seed-img-3': suvKiaSportage2024,
  'seed-img-4': santaLogo,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('isEdited', 'isEdited', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function imageToRow(image: StudioImage) {
  return {
    id: image.id,
    name: image.name,
    data_url: image.dataUrl,
    width: image.width,
    height: image.height,
    format: image.format,
    size: image.size,
    category: image.category,
    is_edited: image.isEdited,
    original_id: image.originalId || null,
    original_name: image.originalName || null,
    created_at: image.createdAt,
    updated_at: image.updatedAt,
  };
}

function rowToImage(row: any): StudioImage {
  return {
    id: String(row.id),
    name: String(row.name || 'Untitled Image'),
    dataUrl: sanitizeImageUrl(row.data_url, santaLogo),
    width: Number(row.width) || 800,
    height: Number(row.height) || 600,
    format: (row.format as ImageFormat) || 'image/jpeg',
    size: Number(row.size) || 0,
    category: (row.category as ImageCategory) || 'General',
    isEdited: Boolean(row.is_edited),
    originalId: row.original_id || undefined,
    originalName: row.original_name || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export async function getAllStudioImages(): Promise<StudioImage[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('studio_images')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = data.map(rowToImage);
        void seedDefaultImages(mapped);
        return mapped;
      }
    } catch {
      // Fallback to IndexedDB below
    }
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: StudioImage[] = req.result || [];
        if (results.length === 0) {
          // Initialize with seed images
          results = SEED_IMAGES.map((img) => ({
            ...img,
            dataUrl: SEED_URLS[img.id] || santaLogo,
          }));
          // Save seeds asynchronously in background
          seedDefaultImages(results);
        }
        // Sort newest first
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };

      req.onerror = () => {
        resolve(getFallbackImages());
      };
    });
  } catch {
    return getFallbackImages();
  }
}

async function seedDefaultImages(images: StudioImage[]): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    images.forEach((img) => store.put(img));
  } catch (err) {
    console.warn('Failed to populate seed images into IndexedDB', err);
  }
}

export async function saveStudioImage(image: StudioImage): Promise<StudioImage> {
  const safeDataUrl = sanitizeImageUrl(image.dataUrl, '');
  if (!safeDataUrl) {
    throw new Error('Invalid image URL or unsupported image format.');
  }
  const cleanImage: StudioImage = { ...image, dataUrl: safeDataUrl };

  if (isSupabaseConfigured() && supabase) {
    try {
      if (await hasSupabaseAuthSession()) {
        await supabase.from('studio_images').upsert(imageToRow(cleanImage), { onConflict: 'id' });
      }
    } catch (err) {
      console.warn('[imageStudioStorage] Supabase save skipped:', err);
    }
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(cleanImage);

      req.onsuccess = () => resolve(cleanImage);
      req.onerror = () => reject(req.error);
    });
  } catch {
    saveFallbackImage(cleanImage);
    return cleanImage;
  }
}

export async function deleteStudioImage(id: string): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    try {
      if (await hasSupabaseAuthSession()) {
        await supabase.from('studio_images').delete().eq('id', id);
      }
    } catch (err) {
      console.warn('[imageStudioStorage] Supabase delete skipped:', err);
    }
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    deleteFallbackImage(id);
    return true;
  }
}

export async function updateStudioImage(id: string, updates: Partial<StudioImage>): Promise<StudioImage | null> {
  try {
    const db = await openDatabase();
    const updated = await new Promise<StudioImage | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing: StudioImage | undefined = getReq.result;
        if (!existing) {
          return resolve(null);
        }
        const sanitizedUpdates = { ...updates };
        if (sanitizedUpdates.dataUrl !== undefined) {
          const safeDataUrl = sanitizeImageUrl(sanitizedUpdates.dataUrl, '');
          if (!safeDataUrl) {
            return reject(new Error('Invalid image URL or unsupported image format.'));
          }
          sanitizedUpdates.dataUrl = safeDataUrl;
        }
        const nextImg: StudioImage = {
          ...existing,
          ...sanitizedUpdates,
          updatedAt: new Date().toISOString(),
        };
        const putReq = store.put(nextImg);
        putReq.onsuccess = () => resolve(nextImg);
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });

    if (updated && isSupabaseConfigured() && supabase && (await hasSupabaseAuthSession())) {
      await supabase.from('studio_images').upsert(imageToRow(updated), { onConflict: 'id' });
    }
    return updated;
  } catch {
    return updateFallbackImage(id, updates);
  }
}

// Fallback storage in case IndexedDB is restricted or in private mode
function getFallbackImages(): StudioImage[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) {
      const defaults = SEED_IMAGES.map((img) => ({
        ...img,
        dataUrl: SEED_URLS[img.id] || santaLogo,
      }));
      return defaults;
    }
    const parsed = safeJsonParse<StudioImage[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StudioImage =>
        Boolean(item && typeof item.id === 'string' && typeof item.dataUrl === 'string' && sanitizeImageUrl(item.dataUrl, ''))
    );
  } catch {
    return [];
  }
}

function saveFallbackImage(image: StudioImage): void {
  try {
    const current = getFallbackImages();
    const idx = current.findIndex((i) => i.id === image.id);
    if (idx !== -1) {
      current[idx] = image;
    } else {
      current.unshift(image);
    }
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('LocalStorage fallback image write failed', err);
  }
}

function deleteFallbackImage(id: string): void {
  try {
    const current = getFallbackImages();
    const filtered = current.filter((i) => i.id !== id);
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('LocalStorage fallback delete failed', err);
  }
}

function updateFallbackImage(id: string, updates: Partial<StudioImage>): StudioImage | null {
  try {
    const current = getFallbackImages();
    const idx = current.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.dataUrl !== undefined) {
      const safeDataUrl = sanitizeImageUrl(sanitizedUpdates.dataUrl, '');
      if (!safeDataUrl) return null;
      sanitizedUpdates.dataUrl = safeDataUrl;
    }
    const updated = { ...current[idx], ...sanitizedUpdates, updatedAt: new Date().toISOString() };
    current[idx] = updated;
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(current));
    return updated;
  } catch {
    return null;
  }
}
