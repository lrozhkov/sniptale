import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { EditorHistoryEntry } from '../../../features/editor-history/action';
import { translate, useAppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { runAndReportEditorAction } from '../../runtime/async-actions';
import { useEditorStore } from '../../state/useEditorStore';
import {
  EditorHistoryResetPopover,
  type EditorHistoryResetMode,
} from '../../workspace/floating/history-reset-popover';
import './history.css';

function groupEntries(entries: EditorHistoryEntry[]): EditorHistoryEntry[][] {
  const groups: EditorHistoryEntry[][] = [];
  for (const entry of entries) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (
      previous?.action &&
      entry.action &&
      previous.action.target?.id &&
      previous.action.target.id === entry.action.target?.id &&
      previous.action.operation === entry.action.operation
    )
      group!.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

/** Projects existing history; it owns neither snapshots nor persistence. */
export function EditorInspectorHistory({
  hasImage,
  initialScrollOffset = 0,
  onScrollOffsetChange,
}: {
  hasImage: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
}) {
  useAppLocale();
  const controller = useEditorController();
  const history = useEditorStore((state) => state.history);
  const entries = controller.getHistoryEntries();
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState<EditorHistoryResetMode>('closed');
  const resetRef = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = initialScrollOffset;
  }, [initialScrollOffset]);
  const groups = groupEntries(entries);
  const seek = async (index: number) => {
    if (busy || index === history.index) return;
    setBusy(true);
    try {
      await runAndReportEditorAction('history-seek', () => controller.seekHistory(index));
    } catch {
      // The existing reporter owns failure feedback; keep the selected state available for retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor-history" data-ui="editor.inspector.history">
      <h2 className="m-0 px-5 pt-3 text-sm font-medium">{translate('editor.history.title')}</h2>
      <div className="editor-history-actions">
        <ContentToolbarButton
          ref={resetRef}
          tone="utility"
          title={translate('editor.toolbar.restoreOriginal')}
          disabled={!hasImage || busy}
          aria-haspopup="dialog"
          aria-expanded={resetMode !== 'closed'}
          onClick={() => setResetMode('confirm')}
          className="!h-auto !w-full !justify-start !gap-2 !px-2 !py-2 !text-[13px]"
          dataUi="editor.inspector.history.restore"
        >
          <RotateCcw size={16} className="shrink-0" />
          <span className="whitespace-normal text-start">
            {translate('editor.toolbar.restoreOriginal')}
          </span>
        </ContentToolbarButton>
      </div>
      <div
        ref={scroller}
        className="editor-history-scroll"
        aria-busy={busy}
        onScroll={(event) => onScrollOffsetChange?.(event.currentTarget.scrollTop)}
      >
        <ol className="editor-history-groups" aria-label={translate('editor.history.title')}>
          {groups.map((group) => (
            <li
              key={group[0]!.index}
              className="editor-history-group"
              data-grouped={group.length > 1 || undefined}
            >
              <ol className="editor-history-rows">
                {group.map((entry) => {
                  const current = entry.index === history.index;
                  const future = entry.index > history.index;
                  const action = entry.action;
                  const title = action
                    ? translate(`editor.history.operations.${action.operation}`)
                    : translate('editor.history.start');
                  return (
                    <li key={entry.index}>
                      <button
                        type="button"
                        className="editor-history-row"
                        data-ui="editor.inspector.history.entry"
                        data-index={entry.index}
                        data-future={future || undefined}
                        data-baseline={!action || undefined}
                        aria-current={current ? 'step' : undefined}
                        disabled={busy || !hasImage}
                        onClick={() => void seek(entry.index)}
                      >
                        <span className="editor-history-dot" aria-hidden="true">
                          {current ? <Check size={11} /> : null}
                        </span>
                        <span className="editor-history-caption">
                          <span className="editor-history-operation">{title}</span>
                          {action ? (
                            <span className="editor-history-target">
                              {action.target?.name ||
                                (action.target
                                  ? translate('editor.runtime.layer')
                                  : translate('editor.history.document'))}
                            </span>
                          ) : null}
                          {action?.color && (action.color.before || action.color.after) ? (
                            <span
                              className="editor-history-colors"
                              aria-label={translate('editor.history.colorChange')}
                            >
                              {action.color.before ? (
                                <span
                                  className="editor-history-swatch"
                                  style={{ backgroundColor: action.color.before }}
                                  title={action.color.before}
                                  aria-label={action.color.before}
                                />
                              ) : null}
                              {action.color.before && action.color.after ? (
                                <ArrowRight size={12} aria-hidden="true" />
                              ) : null}
                              {action.color.after ? (
                                <span
                                  className="editor-history-swatch"
                                  style={{ backgroundColor: action.color.after }}
                                  title={action.color.after}
                                  aria-label={action.color.after}
                                />
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                        <span className="editor-history-status">
                          {current
                            ? translate('editor.history.current')
                            : future
                              ? translate('editor.history.undone')
                              : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
        {entries.length <= 1 ? (
          <p className="editor-history-hint">{translate('editor.history.empty')}</p>
        ) : null}
      </div>
      <EditorHistoryResetPopover
        anchorEl={resetRef.current}
        historyIndex={history.index}
        mode={resetMode}
        onBeforeSelectionAwareAction={() => undefined}
        setMode={(mode) => setResetMode(mode === 'choose' ? 'closed' : mode)}
      />
    </div>
  );
}
