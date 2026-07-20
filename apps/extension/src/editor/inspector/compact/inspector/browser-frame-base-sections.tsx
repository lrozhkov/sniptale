import { Globe } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { fireAndReportEditorAction } from '../../../runtime/async-actions';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { SelectField } from '../../../chrome/ui';

function buildBrowserFrameCanvasModeCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'browser-frame-canvas-mode',
    title: translate('editor.compact.canvas'),
    trigger: <CompactCommandToken>CV</CompactCommandToken>,
    value:
      params.browserFrame.canvasMode === 'resize'
        ? translate('editor.compact.increase')
        : translate('editor.compact.noChanges'),
    content: (
      <CompactCommandField
        label={translate('editor.compact.canvasBehavior')}
        value={
          params.browserFrame.canvasMode === 'resize'
            ? translate('editor.compact.browserCanvasModeResize')
            : translate('editor.compact.canvasSizeUnchanged')
        }
      >
        <SelectField
          label={translate('editor.compact.canvasBehavior')}
          options={params.browserCanvasModeOptions}
          value={params.browserFrame.canvasMode}
          onChange={(value) =>
            fireAndReportEditorAction('compact-browser-frame-canvas-mode', () =>
              params.syncBrowserFrame({ canvasMode: value })
            )
          }
        />
      </CompactCommandField>
    ),
  };
}

function buildBrowserFrameContentModeCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'browser-frame-content-mode',
    title: translate('editor.compact.scene'),
    trigger: <CompactCommandToken>SC</CompactCommandToken>,
    value:
      params.browserFrame.contentMode === 'push-down'
        ? translate('editor.compact.shiftDown')
        : translate('editor.compact.fit'),
    content: (
      <CompactCommandField
        label={translate('editor.compact.sceneBehavior')}
        value={
          params.browserFrame.contentMode === 'push-down'
            ? translate('editor.compact.shiftDown')
            : translate('editor.compact.browserContentModeFitContent')
        }
      >
        <SelectField
          label={translate('editor.compact.sceneBehavior')}
          options={params.browserContentModeOptions}
          value={params.browserFrame.contentMode}
          onChange={(value) =>
            fireAndReportEditorAction('compact-browser-frame-content-mode', () =>
              params.syncBrowserFrame({ contentMode: value })
            )
          }
        />
      </CompactCommandField>
    ),
  };
}

export function buildBrowserFrameBaseCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    {
      id: 'browser-frame-action',
      title: translate('editor.compact.browserFrame'),
      trigger: <Globe size={15} strokeWidth={2} />,
      onClick: () =>
        fireAndReportEditorAction('compact-browser-frame-insert-update', () =>
          params.insertOrUpdateBrowserFrame?.()
        ),
    },
    buildBrowserFrameCanvasModeCommand(params),
    buildBrowserFrameContentModeCommand(params),
  ];
}
