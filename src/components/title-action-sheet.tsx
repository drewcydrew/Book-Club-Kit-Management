import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from './design';
import { useReducedMotion } from './motion';
import { TitleCover } from './title-cover';

export type SheetAction = { label: string; accessibilityLabel: string; onPress: () => void; disabled?: boolean; primary?: boolean };

// Small bottom sheet listing the actions available for one title.
export function TitleActionSheet({ name, author, coverUrl, isbn, actions, onClose }: {
  name: string; author: string; coverUrl?: string | null; isbn: string; actions: SheetAction[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, progress]);

  return <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss actions" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: 16 + insets.bottom, opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
        <View style={styles.header}>
          <TitleCover coverUrl={coverUrl} isbn={isbn} style={styles.thumb} />
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            {author ? <Text style={styles.author} numberOfLines={1}>{author}</Text> : null}
          </View>
        </View>
        {actions.map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel}
          accessibilityState={{ disabled: !!action.disabled }} disabled={action.disabled}
          onPress={() => { onClose(); action.onPress(); }}
          style={({ pressed }) => [styles.action, action.primary && styles.primary, pressed && styles.pressed, action.disabled && styles.disabled]}>
          <Text style={[styles.actionText, action.primary && styles.primaryText]}>{action.label}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(24, 58, 54, 0.45)' },
  sheet: { backgroundColor: '#fffefa', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 16, paddingTop: 16, gap: 8, boxShadow: shadow.sheet, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  thumb: { width: 44, height: 64, borderRadius: 4, marginRight: 0 },
  headerText: { flex: 1, gap: 2 },
  name: { fontWeight: '700', fontSize: 16, color: colors.ink },
  author: { color: colors.muted },
  action: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionText: { fontWeight: '600', color: colors.ink, fontSize: 16 },
  primaryText: { color: '#fff' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: colors.muted, fontWeight: '600' },
});
