import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export const HIGHLIGHT_COLOR = '#2563eb';
const DIM_OPACITY = 0.25;
const FADE_MS = 250;
const PATH_DELAY_MS = 260;
const PATH_DRAW_MS = 1200;
// Native driver is unavailable on web, so animate there with JS.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export interface HighlightStop {
  x: number;
  y: number;
}

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

export function FadeCell({ dimmed, reduceMotion, style, children }: {
  dimmed: boolean;
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [opacity] = useState(() => new Animated.Value(dimmed ? DIM_OPACITY : 1));
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: dimmed ? DIM_OPACITY : 1, duration: reduceMotion ? 0 : FADE_MS, useNativeDriver: USE_NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [dimmed, reduceMotion, opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

// Stops are drawn in order; each segment draws in turn and each stop dot appears as the stroke reaches it.
export function HighlightPath(props: {
  stops: HighlightStop[];
  width: number;
  height: number;
  reduceMotion: boolean;
}) {
  // Keyed on the stops so the draw animation restarts from zero whenever the path changes.
  const pathKey = props.stops.map((stop) => `${stop.x},${stop.y}`).join(' ');
  return <HighlightPathDrawing key={pathKey} {...props} />;
}

function HighlightPathDrawing({ stops, width, height, reduceMotion }: {
  stops: HighlightStop[];
  width: number;
  height: number;
  reduceMotion: boolean;
}) {
  // Progress is kept as plain state so react-native-svg receives ordinary props on every platform.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const value = new Animated.Value(0);
    const listener = value.addListener(({ value: next }) => setProgress(next));
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: reduceMotion ? 0 : PATH_DRAW_MS,
      delay: reduceMotion ? 0 : PATH_DELAY_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      value.removeListener(listener);
    };
  }, [reduceMotion]);

  if (stops.length === 0) return null;
  const segmentCount = stops.length - 1;
  const segments = stops.slice(1).map((stop, index) => {
    const previous = stops[index];
    const length = Math.hypot(stop.x - previous.x, stop.y - previous.y);
    const start = index / segmentCount;
    const end = (index + 1) / segmentCount;
    const drawn = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    return <Path key={`segment-${index}`} d={`M${previous.x} ${previous.y} L${stop.x} ${stop.y}`}
      fill="none" stroke={HIGHLIGHT_COLOR} strokeWidth={3} strokeLinecap="round"
      strokeDasharray={[length, length]} strokeDashoffset={length * (1 - drawn)} />;
  });
  const dots = stops.map((stop, index) => {
    const at = segmentCount === 0 ? 0 : index / segmentCount;
    const shown = progress >= at ? 1 : 0;
    return <Circle key={`stop-${index}`} cx={stop.x} cy={stop.y} r={5} fill="#fff" stroke={HIGHLIGHT_COLOR} strokeWidth={2.5} opacity={shown} />;
  });
  return <Svg width={width} height={height}>{segments}{dots}</Svg>;
}
