import type { PagePreparationResetScope } from '../../../parser/page-preparation/history';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { PageToolbarControlsContext } from '../state/page-controls';
import { PageProtectedControls } from '../controls/control-visibility';
import { Redo2, Undo2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { normalizeHotkeyKey } from '../../../../features/keyboard-shortcuts/hotkeys';
import {
  pagePreparationHistory,
  getPagePreparationHistoryDomain,
  type PagePreparationHistoryDomain,
} from '../../../parser/page-preparation/history';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarMenuState } from '../state/menu';
import { ToolbarResetConfirmControl } from './reset-confirm';
import { isFrameEditing } from '../../../selection/highlighter';
import { addFrameEditingChangedListener } from '../../../platform/page-context/mode-events';

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

function usePagePreparationHistoryState(domain?: PagePreparationHistoryDomain) {
  useSyncExternalStore(
    pagePreparationHistory.subscribe,
    () => pagePreparationHistory.getState().revision
  );
  return {
    ...pagePreparationHistory.getState(domain),
    hasOpenTransactions: pagePreparationHistory.hasOpenTransactions(),
  };
}

function useFrameEditingState(): boolean {
  const [active, setActive] = useState(isFrameEditing);

  useEffect(() => {
    return addFrameEditingChangedListener(({ active: nextActive }) => {
      setActive(nextActive);
    });
  }, []);

  return active;
}

function handleHistoryHotkey(args: {
  canRedo: boolean;
  canUndo: boolean;
  event: KeyboardEvent;
  domain: PagePreparationHistoryDomain | undefined;
}) {
  if (matchesHotkey(args.event, 'KeyZ', 'z') && args.event.shiftKey && args.canRedo) {
    args.event.preventDefault();
    pagePreparationHistory.redo(args.domain);
    return;
  }

  if (matchesHotkey(args.event, 'KeyZ', 'z') && !args.event.shiftKey && args.canUndo) {
    args.event.preventDefault();
    pagePreparationHistory.undo(args.domain);
    return;
  }

  if (matchesHotkey(args.event, 'KeyY', 'y') && args.event.ctrlKey && args.canRedo) {
    args.event.preventDefault();
    pagePreparationHistory.redo(args.domain);
  }
}

function usePagePreparationHistoryHotkeys(args: {
  canRedo: boolean;
  canUndo: boolean;
  screenshotMode: boolean;
  domain: PagePreparationHistoryDomain | undefined;
}) {
  useEffect(() => {
    if (!args.screenshotMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      if (
        event.composedPath().some(isEditableTarget) ||
        isEditableTarget(event.target) ||
        hasActiveInlineEditing()
      ) {
        return;
      }

      handleHistoryHotkey({
        canRedo: args.canRedo,
        canUndo: args.canUndo,
        event,
        domain: args.domain,
      });
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [args.canRedo, args.canUndo, args.screenshotMode, args.domain]);
}

const HISTORY_COPY = {
  annotation: { undo: 'content.toolbar.undoAnnotation', redo: 'content.toolbar.redoAnnotation' },
  drawing: { undo: 'content.toolbar.undoDrawing', redo: 'content.toolbar.redoDrawing' },
  'page-editing': { undo: 'content.toolbar.undoPageEdit', redo: 'content.toolbar.redoPageEdit' },
} as const;

function HistoryButton(props: {
  action: 'undo' | 'redo';
  canRun: boolean;
  domain: PagePreparationHistoryDomain | undefined;
}) {
  const copyKey = props.domain
    ? HISTORY_COPY[props.domain][props.action]
    : props.action === 'undo'
      ? 'editor.toolbar.undo'
      : 'editor.toolbar.redo';
  const Icon = props.action === 'undo' ? Undo2 : Redo2;
  const handleClick = () => pagePreparationHistory[props.action](props.domain);

  return (
    <ContentToolbarButton
      tone="utility"
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

export function ToolbarHistoryControls(props: {
  screenshotMode: boolean;
  displayMode: ContentToolbarDisplayMode;
  toolbarMenuState: ToolbarMenuState;
  isNavigationMode?: boolean;
  canClearPagePreparation?: boolean;
  resetScope?: PagePreparationResetScope;
  onClearPagePreparation?: () => void;
}) {
  const domain =
    props.resetScope && props.resetScope !== 'all'
      ? getPagePreparationHistoryDomain(props.resetScope)
      : undefined;
  const historyState = usePagePreparationHistoryState(domain);
  const visibility = useContext(PageToolbarControlsContext);
  const frameEditing = useFrameEditingState();
  const canUndo =
    !visibility?.editing &&
    historyState.canUndo &&
    !historyState.hasOpenTransactions &&
    !frameEditing;
  const canRedo =
    !visibility?.editing &&
    historyState.canRedo &&
    !historyState.hasOpenTransactions &&
    !frameEditing;

  usePagePreparationHistoryHotkeys({
    canRedo,
    canUndo,
    screenshotMode: props.screenshotMode && !props.isNavigationMode,
    domain,
  });

  return (
    <>
      <PageProtectedControls>
        {props.isNavigationMode ? null : (
          <HistoryButton action="undo" canRun={canUndo} domain={domain} />
        )}
        {props.isNavigationMode ? null : (
          <HistoryButton action="redo" canRun={canRedo} domain={domain} />
        )}
        <ToolbarResetConfirmControl
          displayMode={props.displayMode}
          toolbarMenuState={props.toolbarMenuState}
          available={Boolean(props.canClearPagePreparation && props.onClearPagePreparation)}
          onConfirm={props.onClearPagePreparation}
          scope={props.resetScope ?? 'all'}
        />
      </PageProtectedControls>
    </>
  );
}
