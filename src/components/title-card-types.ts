import type { DimensionValue } from 'react-native';
import type { Title } from '../domain/model';

export type TitleCardProps = {
  title: Title; kitLabels: string; width: DimensionValue; disabled: boolean; hidden?: 'wont' | 'read'; enterDelay?: number;
  onSelect: () => void; onDismiss: () => void; onRead: () => void; onRestore: () => void; onShowDetails: () => void;
};
