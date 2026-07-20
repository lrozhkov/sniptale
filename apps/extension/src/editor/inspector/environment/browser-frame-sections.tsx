import React from 'react';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
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
  <div className="space-y-3">
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
  </div>
);

export const BrowserFrameInsertSection: React.FC<{
  insertOrUpdateBrowserFrame: () => Promise<void> | void;
}> = ({ insertOrUpdateBrowserFrame }) => (
  <button
    type="button"
    className={cx(
      panelButtonClassName,
      'w-full border-[color:var(--sniptale-color-border-accent-strong)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_76%,transparent)]',
      'text-[color:var(--sniptale-color-accent-emphasis)]',
      'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-surface-panel))]',
      'hover:text-[color:var(--sniptale-color-accent-strong)]'
    )}
    onClick={() =>
      fireAndReportEditorAction('browser-frame-insert-update', () => insertOrUpdateBrowserFrame())
    }
  >
    {translate('editor.compact.apply')}
  </button>
);
