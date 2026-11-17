import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import * as Sharing from 'expo-sharing';
import { Action } from './ui';

const instructions = require('../../public/schedule-instructions.pdf');

export function ScheduleInstructions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setError('');
    try {
      const asset = Asset.fromModule(instructions);
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = asset.uri;
        link.download = 'schedule-instructions.pdf';
        link.click();
        return;
      }

      setBusy(true);
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('The instructions could not be downloaded.');
      await Sharing.shareAsync(asset.localUri, { mimeType: 'application/pdf', dialogTitle: 'Save schedule instructions', UTI: 'com.adobe.pdf' });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to download schedule instructions.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ gap: 6 }}>
    <Action title={busy ? 'Preparing instructions…' : 'Download instructions'} disabled={busy} onPress={() => { void download(); }} />
    {error ? <Text style={{ color: '#a22525' }}>Unable to download instructions: {error}</Text> : null}
  </View>;
}
