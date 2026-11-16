import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Note } from './ui';

export type PendingAction = 'Saving' | 'Deleting';

export function PendingStatus({ action }: { action: PendingAction | null }) {
  if (!action) return null;
  return <View style={styles.pending} accessibilityRole="progressbar" accessibilityLabel={`${action}…`}>
    <ActivityIndicator /><Note>{action}…</Note>
  </View>;
}

const styles = StyleSheet.create({
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
