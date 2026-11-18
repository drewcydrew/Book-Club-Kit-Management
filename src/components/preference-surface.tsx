import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export type PreferenceSurfaceProps = {
  children: ReactNode;
  actions: ReactNode;
  // Cover area; on web the actions float over it on hover instead of hiding the whole card.
  media?: ReactNode;
  kind: 'palette' | 'rank';
  active?: boolean;
  enterDelay?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function PreferenceSurface({ children, actions, media, style, onLayout }: PreferenceSurfaceProps) {
  return <View style={style} onLayout={onLayout}>{media}{children}{actions}</View>;
}
