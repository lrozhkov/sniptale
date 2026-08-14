import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { ProductSaveDialogSurface } from '@sniptale/ui/product-save-dialog';
import { translate } from '../../../platform/i18n';
import type { EditorFloatingDocumentController } from './document-bar-types';
import { useAnchoredDialogLifecycle } from './anchored-feedback';

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function EditorSaveToFolderDialog(props: {
  anchorEl: HTMLButtonElement | null;
  controller: EditorFloatingDocumentController;
  defaultFilename: string;
  onClose: () => void;
}) {
  const { anchorEl, onClose } = props;
  const [filename, setFilename] = useState(props.defaultFilename);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverStyle = useSaveToFolderPopoverPosition(anchorEl);

  useAnchoredDialogLifecycle({
    anchorEl,
    initialFocusSelector: 'input, button:not([disabled])',
    onClose,
    popoverRef,
  });

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const runSave = async (action: () => Promise<void> | void) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState('saving');
    try {
      await action();
      if (!mountedRef.current) return;
      setSaveState('success');
      closeTimerRef.current = window.setTimeout(props.onClose, 450);
    } catch {
      if (!mountedRef.current) return;
      savingRef.current = false;
      setSaveState('error');
    }
  };

  return (
    <ContentPopoverAdapter
      anchorEl={anchorEl}
      className="sniptale-save-dialog !w-[min(560px,calc(100vw-24px))] max-h-[calc(100vh-5rem)] !p-0 overflow-y-auto"
      dataUi="editor.floating.document-bar.save-to-folder-popover"
      isOpen
      popoverRef={popoverRef}
      style={popoverStyle}
    >
      <div role="dialog" aria-labelledby="save-dialog-title">
        <ProductSaveDialogSurface
          title={translate('editor.documentActions.saveDialogTitle')}
          subtitle={translate('editor.documentActions.saveDialogSubtitle')}
          closeLabel={translate('common.actions.close')}
          filenameLabel={translate('editor.documentActions.saveDialogFilename')}
          filename={filename}
          disabled={saveState === 'saving' || saveState === 'success'}
          filenamePlaceholder={translate('editor.documentActions.saveDialogFilenamePlaceholder')}
          onFilenameChange={(value) => {
            setFilename(value);
            if (saveState === 'error') {
              savingRef.current = false;
              setSaveState('idle');
            }
          }}
          presetLabel={translate('editor.documentActions.saveDialogPresets')}
          presetCount={props.controller.savePresets.length}
          presetItems={props.controller.savePresets.map((preset) => ({
            id: preset.id,
            title: preset.name,
            path: `${translate('editor.documentActions.downloadsPrefix')} ${
              preset.path || translate('editor.documentActions.pathFallback')
            }`,
          }))}
          presetsEmptyState={translate('editor.documentActions.noSavePresets')}
          systemFolderLabel={translate('editor.documentActions.saveDialogSystemFolder')}
          systemFolderHint={translate('editor.documentActions.saveDialogSystemFolderHint')}
          onChoosePreset={(presetId) =>
            void runSave(() => props.controller.saveToPreset(presetId, { filename }))
          }
          onChooseSystemFolder={() =>
            void runSave(() => props.controller.onSaveImageAs({ filename }))
          }
          onClose={props.onClose}
          footer={
            saveState === 'idle' ? null : (
              <div
                role={saveState === 'error' ? 'alert' : 'status'}
                className="text-sm text-[var(--sniptale-color-text-muted)]"
              >
                {translate(
                  saveState === 'saving'
                    ? 'common.states.saving'
                    : saveState === 'success'
                      ? 'common.states.saved'
                      : 'editor.documentActions.saveDialogError'
                )}
              </div>
            )
          }
        />
      </div>
    </ContentPopoverAdapter>
  );
}

function useSaveToFolderPopoverPosition(anchorEl: HTMLElement | null): CSSProperties {
  const [, refresh] = useReducer((value) => value + 1, 0);
  useLayoutEffect(() => bindFloatingInteractionPositionListeners(anchorEl, refresh), [anchorEl]);
  if (!anchorEl) {
    return { left: 0, pointerEvents: 'none', position: 'fixed', top: 0, visibility: 'hidden' };
  }
  const margin = 12;
  const gap = 8;
  const width = Math.min(560, window.innerWidth - margin * 2);
  const anchor = anchorEl.getBoundingClientRect();
  const left = Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin));
  return {
    left,
    maxHeight: `calc(100vh - ${anchor.bottom + gap + margin}px)`,
    position: 'fixed',
    top: anchor.bottom + gap,
    width,
    zIndex: 2147483647,
  };
}
