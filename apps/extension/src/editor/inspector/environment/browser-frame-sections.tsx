import React from 'react';
import { translate } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { SelectField, type CompactSelectOption } from '../../chrome/ui';
import type { BrowserFrameState } from '../../../features/editor/document/types';

export const BrowserFrameBehaviorSections: React.FC<{
  browserCanvasModeOptions: CompactSelectOption<'resize' | 'keep-size'>[];
  browserFrame: Pick<BrowserFrameState, 'canvasMode' | 'contentMode'>;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}> = ({ browserCanvasModeOptions, browserFrame, syncBrowserFrame }) => (
  <SelectField
    label={translate('windowHeader.placement')}
    options={browserCanvasModeOptions}
    value={browserFrame.canvasMode}
    onChange={(value) =>
      fireAndReportEditorAction('browser-frame-composition', () =>
        syncBrowserFrame({
          canvasMode: value,
          contentMode: value === 'resize' ? 'push-down' : 'fit-content',
        })
      )
    }
  />
);
