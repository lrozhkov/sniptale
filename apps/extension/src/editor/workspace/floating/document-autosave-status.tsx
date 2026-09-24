import { Check, LoaderCircle, PauseCircle, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { EditorIconButton } from '../../chrome/ui';
import { useDocumentStatusPopover } from './document-save-conflict';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function getStatusLabel(enabled: boolean, saveState: SaveState, hasSaveError: boolean): string {
  if (!enabled) return translate('editor.documentActions.autosaveOffStatus');
  if (hasSaveError) return translate('editor.documentActions.autosaveTitle');
  return translate(
    saveState === 'saved'
      ? 'common.states.saved'
      : saveState === 'saving'
        ? 'common.states.saving'
        : 'common.states.dirty'
  );
}

type StatusPopover = ReturnType<typeof useDocumentStatusPopover>;

function AutosaveStatusTrigger({
  enabled,
  saveState,
  hasSaveError,
  label,
  popover,
}: {
  enabled: boolean;
  saveState: SaveState;
  hasSaveError: boolean;
  label: string;
  popover: StatusPopover;
}) {
  return (
    <button
      ref={popover.setAnchor}
      type="button"
      data-state={!enabled ? 'off' : hasSaveError ? 'autosave-settings' : saveState}
      data-ui="editor.floating.document-bar.autosave-trigger"
      title={label}
      aria-label={label}
      aria-expanded={popover.open}
      aria-haspopup="dialog"
      aria-controls={popover.open ? 'editor-autosave-status' : undefined}
      className={[
        'inline-flex items-center gap-1 rounded px-0.5 outline-none',
        'focus-visible:ring-1 focus-visible:ring-current',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
        enabled && saveState === 'saved'
          ? 'text-[var(--sniptale-color-success)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      onClick={() => {
        popover.manualOpen.current = !popover.open;
        popover.setOpen(!popover.open);
      }}
    >
      {!enabled ? (
        <>
          <PauseCircle size={12} aria-hidden="true" />
          <span>{label}</span>
        </>
      ) : hasSaveError ? (
        <Settings2 size={12} aria-hidden="true" />
      ) : saveState === 'saved' ? (
        <Check size={12} strokeWidth={2.4} aria-hidden="true" />
      ) : saveState === 'saving' ? (
        <LoaderCircle
          size={12}
          strokeWidth={2}
          className="motion-safe:animate-spin"
          aria-hidden="true"
        />
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

function AutosaveStatusLayer({
  enabled,
  popover,
  onChange,
}: {
  enabled: boolean;
  popover: StatusPopover;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <ContentPopoverAdapter
      anchorEl={popover.anchor}
      isOpen={popover.open}
      popoverRef={popover.layerRef}
      dataUi="editor.floating.document-bar.autosave-popover"
      className={[
        'sniptale-content-popover--compact !w-[min(340px,calc(100vw-24px))]',
        '!bg-[var(--sniptale-color-surface-panel)] backdrop-blur-[12px]',
      ].join(' ')}
      style={popover.position.style}
    >
      <span
        aria-hidden="true"
        className={[
          'absolute -top-1.5 size-3 rotate-45 border-l border-t',
          'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        ].join(' ')}
        style={{ left: popover.position.arrow - 6 }}
      />
      <div
        id="editor-autosave-status"
        role="dialog"
        data-floating-ui-root="true"
        aria-labelledby="editor-autosave-status-title"
        className="relative space-y-3 overflow-y-auto p-2"
        style={{ maxHeight: popover.position.style.maxHeight }}
      >
        <div className="flex items-start gap-2">
          {enabled ? (
            <Check
              size={16}
              className="mt-0.5 shrink-0 text-[var(--sniptale-color-success)]"
              aria-hidden="true"
            />
          ) : (
            <PauseCircle
              size={16}
              className="mt-0.5 shrink-0 text-[var(--sniptale-color-text-secondary)]"
              aria-hidden="true"
            />
          )}
          <h3
            id="editor-autosave-status-title"
            className="min-w-0 flex-1 text-sm font-medium text-[var(--sniptale-color-text-primary)]"
          >
            {translate('editor.documentActions.autosaveTitle')}
          </h3>
          <EditorIconButton
            title={translate('common.actions.close')}
            onClick={popover.close}
            className="!h-6 !w-6"
          >
            <X size={14} />
          </EditorIconButton>
        </div>
        <p className="text-xs leading-relaxed text-[var(--sniptale-color-text-secondary)]">
          {translate(
            enabled
              ? 'editor.documentActions.autosaveOnDescription'
              : 'editor.documentActions.autosaveOffDescription'
          )}
        </p>
        <label
          className={[
            'flex cursor-pointer items-center justify-between gap-3 rounded px-1 py-1',
            'text-xs text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {translate('editor.documentActions.autosaveTitle')}
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            checked={enabled}
            className="peer sr-only"
            onChange={(event) => {
              const next = event.currentTarget.checked;
              onChange(next);
            }}
          />
          <span
            aria-hidden="true"
            className={[
              'relative h-5 w-9 shrink-0 rounded-full border border-[var(--sniptale-color-border-soft)]',
              'bg-[var(--sniptale-color-surface-hover)] transition-colors',
              'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
              'peer-checked:bg-[var(--sniptale-color-accent)]',
              'before:absolute before:left-0.5 before:top-0.5 before:size-3.5 before:rounded-full',
              'before:bg-[var(--sniptale-color-surface-panel)] before:shadow-sm',
              'before:transition-transform peer-checked:before:translate-x-4',
            ].join(' ')}
          />
        </label>
      </div>
    </ContentPopoverAdapter>
  );
}

export function DocumentAutosaveStatus({
  saveState,
  hasSaveError,
}: {
  saveState: SaveState;
  hasSaveError: boolean;
}) {
  const controller = useEditorController();
  const service = controller.autosaveService;
  const [enabled, setEnabled] = useState(() => service?.isEnabled() ?? true);
  const popover = useDocumentStatusPopover();
  const label = getStatusLabel(enabled, saveState, hasSaveError);

  return (
    <>
      <AutosaveStatusTrigger
        enabled={enabled}
        saveState={saveState}
        hasSaveError={hasSaveError}
        label={label}
        popover={popover}
      />
      <AutosaveStatusLayer
        enabled={enabled}
        popover={popover}
        onChange={(next) => {
          service?.setEnabled(next, () => controller.exportDocument());
          setEnabled(next);
        }}
      />
    </>
  );
}
