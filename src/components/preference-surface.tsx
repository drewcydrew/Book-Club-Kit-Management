import type { ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from './design';
import { FadeIn } from './fade-in';

export type PreferenceSurfaceProps = {
  children: ReactNode;
  // Hover actions are web-only; native cards route actions through a tap-to-open sheet instead.
  actions?: ReactNode;
  // Cover area; on web the actions float over it on hover instead of hiding the whole card.
  media?: ReactNode;
  kind: 'palette' | 'rank';
  // Web: card is being dragged. Native: card is the selected one.
  active?: boolean;
  enterDelay?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function PreferenceSurface({ children, media, active, enterDelay, style, onLayout }: PreferenceSurfaceProps) {
  return <FadeIn delay={enterDelay} onLayout={onLayout} style={[styles.surface, active && styles.active, style]}>
    <View style={styles.media}>{media}</View>
    <View style={styles.body}>{children}</View>
  </FadeIn>;
}

const styles = StyleSheet.create({
  surface: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 8, gap: 6, boxShadow: shadow.card },
  active: { borderColor: colors.accent, borderWidth: 2, padding: 7, boxShadow: shadow.lifted },
  media: { borderRadius: radius.media, overflow: 'hidden', backgroundColor: colors.coverBg },
  body: { gap: 3 },
});
