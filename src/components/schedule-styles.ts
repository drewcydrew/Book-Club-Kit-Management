import { StyleSheet } from 'react-native';

export const scheduleStyles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalDialog: { width: '100%', maxWidth: 650, flexShrink: 1, backgroundColor: '#fffefa', padding: 16, gap: 12 },
  modalHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modalScroll: { flexShrink: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  column: { width: '32%' },
  singleColumn: { gap: 12 },
});
