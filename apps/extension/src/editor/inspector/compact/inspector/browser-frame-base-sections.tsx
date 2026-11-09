import { translate } from '../../../../platform/i18n';
import { CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { BrowserFrameBehaviorSections } from '../../environment/browser-frame-sections';

export function buildBrowserFrameBaseCommands(params: InspectorCommandParams): CompactCommand[] {
  if (!params.browserFrame.enabled) return [];
  return [
    {
      id: 'browser-frame-composition',
      title: translate('editor.scene.placementSection'),
      trigger: <CompactCommandToken>CV</CompactCommandToken>,
      value: translate(
        params.browserFrame.canvasMode === 'resize'
          ? 'windowHeader.expandCanvas'
          : 'windowHeader.fitCanvas'
      ),
      content: (
        <BrowserFrameBehaviorSections
          browserCanvasModeOptions={params.browserCanvasModeOptions}
          browserFrame={params.browserFrame}
          syncBrowserFrame={params.syncBrowserFrame}
        />
      ),
    },
  ];
}
