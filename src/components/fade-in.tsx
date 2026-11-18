import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from './motion';

// Fades and lifts children in once on mount using the native driver (opacity/transform only).
export function FadeIn({ delay = 0, style, onLayout, children }: {
  delay?: number; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void; children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: 260, delay, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, progress]);
  return <Animated.View onLayout={onLayout}
    style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
    {children}
  </Animated.View>;
}
