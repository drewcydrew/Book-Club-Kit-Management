import { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Actions, Card, Label, Note } from './ui';
import { scheduleStyles } from './schedule-styles';
import type { useScheduleWorkspace } from './schedule-workspace';

export type ScheduleEditor = ReturnType<typeof useScheduleWorkspace>;

export function useScheduleConfirmation(editor: ScheduleEditor, modalOpen: boolean) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hadModalConfirmation = useRef(false);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const hadDialogConfirmation = useRef(false);
  const discardPending = editor.pendingAction?.kind === 'discard';
  const regeneratePending = editor.pendingAction?.kind === 'regenerate';
  const dialogPending = discardPending || regeneratePending;
  const dialogTitle = regeneratePending ? 'Confirm regeneration' : 'Confirm discard';
  const cancelLabel = regeneratePending ? 'Keep editing instead of regenerating' : 'Keep editing instead of discarding';
  const pendingConfirmation = editor.pendingAction && !dialogPending && <Card>
    <Note>{editor.pendingAction.description}</Note>
    <Actions><Action tone="danger" title={editor.pendingAction.confirmLabel} onPress={editor.confirmAction} />
      <Action title="Keep editing" onPress={editor.cancelAction} /></Actions>
  </Card>;
  const dialogContent = dialogPending && editor.pendingAction && <>
    <Label>{dialogTitle}</Label>
    <ScrollView style={scheduleStyles.modalScroll}><Note>{editor.pendingAction.description}</Note></ScrollView>
    <Actions><Action tone="danger" title={editor.pendingAction.confirmLabel} onPress={editor.confirmAction} />
      <Action title="Keep editing" accessibilityLabel={cancelLabel} onPress={editor.cancelAction} /></Actions>
  </>;
  const dialogConfirmation = dialogPending && !modalOpen && <Modal transparent visible onRequestClose={editor.cancelAction} accessibilityLabel={dialogTitle}>
    <View style={scheduleStyles.modalBackdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel={regeneratePending ? 'Cancel regeneration' : 'Cancel discard'} onPress={editor.cancelAction} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[scheduleStyles.modalDialog, { maxHeight: Math.max(100, height - insets.top - insets.bottom - 32) }]}>
        {dialogContent}
      </View>
    </View>
  </Modal>;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (modalOpen && editor.pendingAction && !dialogPending) {
      hadModalConfirmation.current = true;
      const buttons = document.querySelectorAll<HTMLElement>('[role="dialog"] [role="button"]');
      [...buttons].find((button) => button.textContent === editor.pendingAction?.confirmLabel)?.focus();
    } else if (hadModalConfirmation.current) {
      hadModalConfirmation.current = false;
      if (modalOpen && !dialogPending) {
        const selector = editor.activePicker ? '[role="dialog"] input' : '[aria-label="Close editor"]';
        document.querySelector<HTMLElement>(selector)?.focus();
      }
    }
  }, [modalOpen, editor.pendingAction, editor.activePicker, dialogPending]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (dialogPending) {
      hadDialogConfirmation.current = true;
      if (!confirmationTrigger.current && document.activeElement instanceof HTMLElement) confirmationTrigger.current = document.activeElement;
      document.querySelector<HTMLElement>(`[aria-label="${cancelLabel}"]`)?.focus();
    } else if (hadDialogConfirmation.current) {
      hadDialogConfirmation.current = false;
      const trigger = confirmationTrigger.current;
      if (trigger?.isConnected && trigger.getAttribute('aria-disabled') !== 'true' && !(trigger instanceof HTMLButtonElement && trigger.disabled)) trigger.focus();
      else if (modalOpen) document.querySelector<HTMLElement>('[aria-label="Close editor"]')?.focus();
      confirmationTrigger.current = null;
    } else {
      confirmationTrigger.current = null;
    }
  }, [dialogPending, cancelLabel, modalOpen, editor.busy]);

  function rememberTrigger() {
    if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) confirmationTrigger.current = document.activeElement;
  }

  function requestDiscard() {
    rememberTrigger();
    editor.requestDiscard();
  }

  return { dialogPending, dialogTitle, regeneratePending, pendingConfirmation, dialogContent, dialogConfirmation, rememberTrigger, requestDiscard };
}
