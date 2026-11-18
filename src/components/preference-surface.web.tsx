/// <reference types="expo/types" />
import { View } from 'react-native';
import type { PreferenceSurfaceProps } from './preference-surface';
import styles from './preference-surface.module.css';

export function PreferenceSurface({ children, actions, kind, style, onLayout }: PreferenceSurfaceProps) {
  return <View style={style} onLayout={onLayout}>
    <div className={`${styles.surface} ${kind === 'palette' ? styles.palette : styles.rank}`}>
      {children}
      <div className={styles.actions}>{actions}</div>
    </div>
  </View>;
}
