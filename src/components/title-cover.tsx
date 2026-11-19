import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import { fetchIsbnCover } from '../state/api';

const coverRequests = new Map<string, Promise<string | null>>();

export function clearCoverCache() {
  coverRequests.clear();
}

function loadCover(isbn: string): Promise<string | null> {
  let request = coverRequests.get(isbn);
  if (!request) {
    request = fetchIsbnCover(isbn).catch(() => null).then((imageUrl) => {
      // Failed lookups are dropped from the cache so a later render can retry them.
      if (!imageUrl) coverRequests.delete(isbn);
      return imageUrl;
    });
    coverRequests.set(isbn, request);
  }
  return request;
}

// A saved cover URL is shown directly; otherwise the ISBN is looked up for a fallback image.
export function TitleCover({ coverUrl, isbn, style }: { coverUrl?: string | null; isbn: string; style?: StyleProp<ImageStyle> }) {
  const hasIsbn = isbn.trim() !== '';
  const needsLookup = !coverUrl && hasIsbn;
  const [result, setResult] = useState<{ isbn: string; imageUrl: string | null } | null>(null);

  useEffect(() => {
    if (!needsLookup) return;
    let active = true;
    void loadCover(isbn.trim()).then((imageUrl) => {
      if (active) setResult({ isbn, imageUrl });
    });
    return () => { active = false; };
  }, [isbn, needsLookup]);

  if (coverUrl) return <Image source={{ uri: coverUrl }} style={[styles.cover, style]} accessibilityLabel="Book cover" resizeMode="cover" />;
  if (!hasIsbn) return null;
  const current = result?.isbn === isbn ? result : null;
  if (current?.imageUrl) return <Image source={{ uri: current.imageUrl }} style={[styles.cover, style]} accessibilityLabel="Book cover" resizeMode="cover" />;
  return <View style={[styles.cover, styles.placeholder, style]}>
    <Text style={styles.placeholderText}>{current ? 'No cover' : '…'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  cover: { width: 48, height: 72, borderRadius: 4, marginRight: 12 },
  placeholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 10, color: '#6b7280', textAlign: 'center' },
});
