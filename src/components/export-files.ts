import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchIsbnCover } from '../state/api';

const fontAsset = require('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf');
const boldFontAsset = require('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf');
const logoAsset = require('../../assets/Hume Libraries Logo - White Background.png');
const maxCoverBytes = 5 * 1024 * 1024;

async function loadAssetBytes(source: number, failure: string): Promise<Uint8Array> {
  const asset = Asset.fromModule(source);
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error(failure);
    return new Uint8Array(await response.arrayBuffer());
  }
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(failure);
  return new File(asset.localUri).bytes();
}

export const fontData = (): Promise<Uint8Array> => loadAssetBytes(fontAsset, 'Unable to load the PDF font.');
export const boldFontData = (): Promise<Uint8Array> => loadAssetBytes(boldFontAsset, 'Unable to load the PDF font.');
export const logoData = (): Promise<Uint8Array> => loadAssetBytes(logoAsset, 'Unable to load the logo.');

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Cover lookup timed out.')), milliseconds);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadCovers(titles: readonly { id: string; coverUrl: string; isbn: string }[]): Promise<{ covers: Map<string, Uint8Array>; missing: number }> {
  const entries = [...new Map(titles.map((title) => [title.id, title] as const))];
  const covers = new Map<string, Uint8Array>();
  let missing = 0;
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const [id, row] = entries[next++];
      try {
        const url = row.coverUrl || (row.isbn ? await withTimeout(fetchIsbnCover(row.isbn), 8000) : null);
        if (!url || !/^https:\/\//i.test(url)) throw new Error('No usable cover URL.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Cover download failed.');
          const length = Number(response.headers.get('content-length'));
          if (length > maxCoverBytes) throw new Error('Cover is too large.');
          const bytes = new Uint8Array(await response.arrayBuffer());
          const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
          const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
          if (bytes.length > maxCoverBytes || (!jpeg && !png)) throw new Error('Unsupported cover image.');
          covers.set(id, bytes);
        } finally {
          clearTimeout(timer);
        }
      } catch {
        missing += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => worker()));
  return { covers, missing };
}

export async function deliver(content: string | Uint8Array, filename: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const file = new File(Paths.cache, `${Date.now()}-${filename}`);
  await file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf'
      : mimeType === 'text/html' ? 'public.html' : mimeType === 'application/zip' ? 'public.zip-archive' : 'public.comma-separated-values-text',
  });
}
