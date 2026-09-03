import React, { useState } from 'react';
import {
  ProductGlassChip,
  ProductGlassRow,
  ProductGlassSectionLabel,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { fireAndReportEditorAction, runAndReportEditorAction } from '../../runtime/async-actions';
import type { CompactSelectOption } from '../../chrome/ui';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';

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
    <BrowserFrameChoiceRow
      label={translate('editor.compact.canvasBehavior')}
      options={browserCanvasModeOptions}
      value={browserFrame.canvasMode}
      onChange={(value) =>
        fireAndReportEditorAction('browser-frame-canvas-mode', () =>
          syncBrowserFrame({ canvasMode: value })
        )
      }
    />
    <BrowserFrameChoiceRow
      label={translate('editor.compact.sceneBehavior')}
      options={browserContentModeOptions}
      value={browserFrame.contentMode}
      onChange={(value) =>
        fireAndReportEditorAction('browser-frame-content-mode', () =>
          syncBrowserFrame({ contentMode: value })
        )
      }
    />
  </fieldset>
);

function BrowserFrameChoiceRow<T extends string>(props: {
  label: string;
  onChange: (value: T) => void;
  options: CompactSelectOption<T>[];
  value: T;
}) {
  return (
    <div className="space-y-1.5">
      <ProductGlassSectionLabel>{props.label}</ProductGlassSectionLabel>
      <ProductGlassRow>
        {props.options.map((option) => (
          <ProductGlassChip
            key={option.value}
            active={option.value === props.value}
            aria-pressed={option.value === props.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
    </div>
  );
}

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
        fallbackKey: 'editor.compact.browserFrameApplyFailed',
        notify: false,
      });
    } catch (error) {
      setActionError(
        createUserFacingErrorMessage({
          cause: error,
          detail: 'unexpected',
          summaryKey: 'editor.compact.browserFrameApplyFailed',
        })
      );
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
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={() => void handleApply()}
      >
        {pending ? translate('common.states.loading') : translate('editor.compact.apply')}
      </button>
    </div>
  );
};
