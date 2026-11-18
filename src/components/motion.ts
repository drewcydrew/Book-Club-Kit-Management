import { useEffect, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Platform } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

// Animates the next layout change (expand/collapse, reorder); a no-op on web and when reduced motion is on.
export function animateLayout(reduced = false) {
  if (Platform.OS === 'web' || reduced) return;
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
