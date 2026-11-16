import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fetchTitleCover } from '../state/api';

const coverRequests = new Map<string, Promise<string | null>>();

function loadCover(titleId: string, isbn: string): Promise<string | null> {
  const key = `${titleId}|${isbn}`;
  let request = coverRequests.get(key);
  if (!request) {
    request = fetchTitleCover(titleId).catch(() => null).then((imageUrl) => {
      // Failed lookups are dropped from the cache so a later render can retry them.
      if (!imageUrl) coverRequests.delete(key);
      return imageUrl;
    });
    coverRequests.set(key, request);
  }
  return request;
}

export function TitleCover({ titleId, isbn }: { titleId: string; isbn: string }) {
  const hasIsbn = isbn.trim() !== '';
  const key = `${titleId}|${isbn}`;
  const [result, setResult] = useState<{ key: string; imageUrl: string | null } | null>(null);

  useEffect(() => {
    if (!hasIsbn) return;
    let active = true;
    void loadCover(titleId, isbn).then((imageUrl) => {
      if (active) setResult({ key, imageUrl });
    });
    return () => { active = false; };
  }, [titleId, isbn, key, hasIsbn]);

  if (!hasIsbn) return null;
  const current = result?.key === key ? result : null;
  if (current?.imageUrl) return <Image source={{ uri: current.imageUrl }} style={styles.cover} accessibilityLabel="Book cover" resizeMode="cover" />;
  return <View style={[styles.cover, styles.placeholder]}>
    <Text style={styles.placeholderText}>{current ? 'No cover' : '…'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  cover: { width: 48, height: 72, borderRadius: 4, marginRight: 12 },
  placeholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 10, color: '#6b7280', textAlign: 'center' },
});
