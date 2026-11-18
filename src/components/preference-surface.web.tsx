/// <reference types="expo/types" />
import { View } from 'react-native';
import type { PreferenceSurfaceProps } from './preference-surface';
import styles from './preference-surface.module.css';

export function PreferenceSurface({ children, actions, media, kind, active, enterDelay = 0, style, onLayout }: PreferenceSurfaceProps) {
  const classes = [styles.surface, kind === 'palette' ? styles.palette : styles.rank, active ? styles.active : ''].join(' ');
  return <View style={style} onLayout={onLayout}>
    <div className={classes} style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}>
      <div className={styles.mediaWrap}>
        {media}
        <div className={styles.actions}>{actions}</div>
      </div>
      {children}
    </div>
  </View>;
}
