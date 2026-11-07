import React from 'react';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { SelectField, type CompactSelectOption } from '../../chrome/ui';

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
  <fieldset className="sniptale-parameter-stack">
    <legend className="sr-only">{translate('editor.compact.browserFrameLayout')}</legend>
    <SelectField
      label={translate('editor.compact.canvasSize')}
      options={browserCanvasModeOptions}
      value={browserFrame.canvasMode}
      onChange={(value) =>
        fireAndReportEditorAction('browser-frame-canvas-mode', () =>
          syncBrowserFrame({ canvasMode: value })
        )
      }
    />
    <SelectField
      label={translate('windowHeader.imageBelowHeader')}
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
