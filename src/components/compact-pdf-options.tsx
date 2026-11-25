import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { compactOptionChoices, defaultCompactOptions, type CompactPdfOptions } from '../domain/club-overview-pdf';
import { Label } from './ui';

export function useCompactOptions() {
  const [options, setOptions] = useState<CompactPdfOptions>(defaultCompactOptions);
  const toggle = (key: keyof CompactPdfOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  return { options, toggle };
}

export function CompactOptionsPicker({ options, onToggle }: { options: CompactPdfOptions; onToggle: (key: keyof CompactPdfOptions) => void }) {
  return <View style={{ gap: 8 }}>
    <Label>Compact PDF includes</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {compactOptionChoices.map((choice) => {
        const checked = options[choice.key];
        return <Pressable key={choice.key} accessibilityRole="checkbox" accessibilityState={{ checked }}
          accessibilityLabel={`Include ${choice.label.toLowerCase()} in compact PDF`} onPress={() => onToggle(choice.key)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 16, borderWidth: 1, borderColor: '#245e51', borderRadius: 3, backgroundColor: checked ? '#245e51' : 'transparent' }} />
          <Text style={{ fontSize: 13, color: '#465c56' }}>{choice.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
