import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export type PreferenceSurfaceProps = {
  children: ReactNode;
  actions: ReactNode;
  kind: 'palette' | 'rank';
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function PreferenceSurface({ children, actions, style, onLayout }: PreferenceSurfaceProps) {
  return <View style={style} onLayout={onLayout}>{children}{actions}</View>;
}
