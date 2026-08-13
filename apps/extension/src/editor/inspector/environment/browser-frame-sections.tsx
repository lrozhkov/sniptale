import React, { useState } from 'react';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction, runAndReportEditorAction } from '../../runtime/async-actions';
import { SelectField, type CompactSelectOption, cx } from '../../chrome/ui';
import { panelButtonClassName } from './shared';

interface BrowserFrameState {
  canvasMode: 'resize' | 'keep-size';
  contentMode: 'push-down' | 'fit-content';
}

export const BrowserFrameBehaviorSections: React.FC<{
  browserCanvasModeOptions: CompactSelectOption<'resize' | 'keep-size'>[];
  browserContentModeOptions: CompactSelectOption<'push-down' | 'fit-content'>[];
  browserFrame: BrowserFrameState;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}> = ({ browserCanvasModeOptions, browserContentModeOptions, browserFrame, syncBrowserFrame }) => (
  <fieldset className="space-y-3">
    <legend className="sr-only">{translate('editor.compact.browserFrameLayout')}</legend>
    <SelectField
      label={translate('editor.compact.canvasBehavior')}
      value={browserFrame.canvasMode}
      options={browserCanvasModeOptions}
      onChange={(value) =>
        fireAndReportEditorAction('browser-frame-canvas-mode', () =>
          syncBrowserFrame({ canvasMode: value })
        )
      }
    />

    <SelectField
      label={translate('editor.compact.sceneBehavior')}
      value={browserFrame.contentMode}
      options={browserContentModeOptions}
      onChange={(value) =>
        fireAndReportEditorAction('browser-frame-content-mode', () =>
          syncBrowserFrame({ contentMode: value })
        )
      }
    />
  </fieldset>
);

export const BrowserFrameInsertSection: React.FC<{
  disabled?: boolean;
  insertOrUpdateBrowserFrame: () => Promise<void> | void;
}> = ({ disabled = false, insertOrUpdateBrowserFrame }) => {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleApply = async () => {
    if (disabled || pending) return;

    setPending(true);
    setActionError(null);
    try {
      await runAndReportEditorAction('browser-frame-insert-update', insertOrUpdateBrowserFrame, {
        fallbackMessage: translate('editor.compact.browserFrameApplyFailed'),
        notify: false,
      });
    } catch {
      setActionError(translate('editor.compact.browserFrameApplyFailed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {actionError ? (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {actionError}
        </p>
      ) : null}
      <button
        type="button"
        className={cx(
          panelButtonClassName,
          'w-full border-[color:var(--sniptale-color-border-accent-strong)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_76%,transparent)]',
          'text-[color:var(--sniptale-color-accent-emphasis)]',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-surface-panel))]',
          'hover:text-[color:var(--sniptale-color-accent-strong)]',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={() => void handleApply()}
      >
        {pending ? translate('common.states.loading') : translate('editor.compact.apply')}
      </button>
    </div>
  );
};
