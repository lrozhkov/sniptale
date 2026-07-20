import { useEffect, useState } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { normalizeHotkeyKey } from '../../../../features/keyboard-shortcuts/hotkeys';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { ToolbarLocalSaveControl } from './local-save';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable]'));
}

function hasActiveInlineEditing(): boolean {
  return document.querySelector('[data-sniptale-editable-id]') !== null;
}

function matchesHotkey(event: KeyboardEvent, code: 'KeyY' | 'KeyZ', key: 'y' | 'z') {
  if (event.code === code) {
    return true;
  }

  return event.code === '' && normalizeHotkeyKey(event.key).toLowerCase() === key;
}

function readPagePreparationHistoryState() {
  return {
    ...pagePreparationHistory.getState(),
    hasOpenTransactions: pagePreparationHistory.hasOpenTransactions(),
  };
}

function usePagePreparationHistoryState() {
  const [historyState, setHistoryState] = useState(readPagePreparationHistoryState);

  useEffect(() => {
    return pagePreparationHistory.subscribe(() => {
      setHistoryState(readPagePreparationHistoryState());
    });
  }, []);

  return historyState;
}

function handleHistoryHotkey(args: { canRedo: boolean; canUndo: boolean; event: KeyboardEvent }) {
  if (matchesHotkey(args.event, 'KeyZ', 'z') && args.event.shiftKey && args.canRedo) {
    args.event.preventDefault();
    pagePreparationHistory.redo();
    return;
  }

  if (matchesHotkey(args.event, 'KeyZ', 'z') && args.canUndo) {
    args.event.preventDefault();
    pagePreparationHistory.undo();
    return;
  }

  if (matchesHotkey(args.event, 'KeyY', 'y') && args.event.ctrlKey && args.canRedo) {
    args.event.preventDefault();
    pagePreparationHistory.redo();
  }
}

function usePagePreparationHistoryHotkeys(args: {
  canRedo: boolean;
  canUndo: boolean;
  screenshotMode: boolean;
}) {
  useEffect(() => {
    if (!args.screenshotMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      if (isEditableTarget(event.target) || hasActiveInlineEditing()) {
        return;
      }

      handleHistoryHotkey({
        canRedo: args.canRedo,
        canUndo: args.canUndo,
        event,
      });
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [args.canRedo, args.canUndo, args.screenshotMode]);
}

function HistoryButton(props: { action: 'undo' | 'redo'; canRun: boolean }) {
  const copyKey = props.action === 'undo' ? 'editor.toolbar.undo' : 'editor.toolbar.redo';
  const Icon = props.action === 'undo' ? Undo2 : Redo2;
  const handleClick =
    props.action === 'undo' ? pagePreparationHistory.undo : pagePreparationHistory.redo;

  return (
    <ContentToolbarButton
      type="button"
      dataUi={`content.toolbar.history-${props.action}-button`}
      title={translate(copyKey)}
      aria-label={translate(copyKey)}
      disabled={!props.canRun}
      onClick={handleClick}
    >
      <Icon size={18} strokeWidth={2} />
    </ContentToolbarButton>
  );
}

export function ToolbarHistoryControls(props: { screenshotMode: boolean }) {
  const historyState = usePagePreparationHistoryState();
  const canUndo = historyState.canUndo && !historyState.hasOpenTransactions;
  const canRedo = historyState.canRedo && !historyState.hasOpenTransactions;

  usePagePreparationHistoryHotkeys({
    canRedo,
    canUndo,
    screenshotMode: props.screenshotMode,
  });

  if (!props.screenshotMode) {
    return null;
  }

  return (
    <>
      <HistoryButton action="undo" canRun={canUndo} />
      <HistoryButton action="redo" canRun={canRedo} />
      <ToolbarLocalSaveControl />
    </>
  );
}
