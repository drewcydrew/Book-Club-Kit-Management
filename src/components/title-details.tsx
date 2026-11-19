import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KitLabel, Title } from '../domain/model';
import { colors, radius, shadow } from './design';
import { useReducedMotion } from './motion';
import { TitleCover } from './title-cover';
import { titleDetailRows } from './title-details-rows';

const HIDDEN = Dimensions.get('window').height;

export function TitleDetails({ title, labels, onClose }: { title: Title; labels?: KitLabel[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(reduced ? 0 : HIDDEN));
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (reduced) {
      offset.setValue(0);
      return;
    }
    const animation = Animated.spring(offset, { toValue: 0, damping: 24, stiffness: 220, mass: 0.9, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, offset]);

  const [dismiss] = useState(() => () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(offset, { toValue: HIDDEN, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
  });
  // Dragging the handle down closes the sheet; a short drag springs back.
  const [handlePan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, state) => { if (state.dy > 0) offset.setValue(state.dy); },
    onPanResponderRelease: (_event, state) => {
      if (state.dy > 90 || state.vy > 0.8) dismiss();
      else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(); },
  }));

  const labelById = new Map((labels ?? []).map((label) => [label.id, label]));
  const rows = titleDetailRows(title).filter(([label]) => label !== 'Author');
  const backdrop = offset.interpolate({ inputRange: [0, HIDDEN], outputRange: [1, 0], extrapolate: 'clamp' });

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss details" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal accessibilityLabel={`Details for ${title.name}`} style={[styles.sheet, { transform: [{ translateY: offset }] }]}>
        <View {...handlePan.panHandlers} style={styles.handleArea} accessibilityLabel="Drag down to close">
          <View style={styles.handle} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close details" hitSlop={8} onPress={dismiss} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 20 + insets.bottom }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.cover}>
              <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={styles.coverImage} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.name}>{title.name}</Text>
              {title.author ? <Text style={styles.author}>{title.author}</Text> : null}
            </View>
          </View>
          {rows.length > 0 && <View style={styles.facts}>
            {rows.map(([label, value]) => <View key={label} style={styles.fact}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{value}</Text>
            </View>)}
          </View>}
          <Text style={styles.heading}>Description</Text>
          <Text style={styles.synopsis}>{title.synopsis || 'No description stored for this title.'}</Text>
          {labels && <>
            <Text style={styles.heading}>Title labels</Text>
            <View style={styles.chips}>
              {title.labelIds.length ? title.labelIds.map((id) => labelById.get(id)).filter((label): label is KitLabel => !!label)
                .map((label) => <Text key={label.id} style={styles.chip}>{label.name}</Text>) : <Text style={styles.muted}>No labels</Text>}
            </View>
            <Text style={styles.muted}>Labels do not reserve a kit or guarantee availability.</Text>
          </>}
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(24, 58, 54, 0.5)' },
  sheet: { maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: '#fffefa', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, boxShadow: shadow.sheet },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#c5d1cb' },
  close: { position: 'absolute', top: 6, right: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { fontSize: 28, lineHeight: 30, color: colors.muted },
  content: { paddingHorizontal: 20, gap: 8 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  cover: { width: 84, aspectRatio: 2 / 3, borderRadius: radius.media, overflow: 'hidden', backgroundColor: colors.coverBg },
  coverImage: { width: '100%', height: '100%', borderRadius: 0, marginRight: 0 },
  headerText: { flex: 1, gap: 2 },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  author: { fontSize: 15, color: colors.muted },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginTop: 8 },
  fact: { width: '50%', paddingRight: 8 },
  factLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#65877b' },
  factValue: { fontSize: 14, color: colors.ink },
  heading: { marginTop: 12, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.accent },
  synopsis: { color: colors.ink, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.accentSoft, color: '#183f37', fontSize: 12 },
});
