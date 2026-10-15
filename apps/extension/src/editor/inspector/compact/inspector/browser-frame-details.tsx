import { translate } from '../../../../platform/i18n';
import { EditorWindowHeaderSettings } from '../../environment/browser-frame';
import { CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';

export function buildBrowserFrameDetailCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    {
      id: 'browser-frame-preset',
      icon: 'browser',
      title: translate('windowHeader.enabled'),
      trigger: <CompactCommandToken>PRE</CompactCommandToken>,
      value: translate('windowHeader.enabled'),
      content: (
        <EditorWindowHeaderSettings
          browserFrame={params.browserFrame}
          syncBrowserFrame={params.syncBrowserFrame}
        />
      ),
    },
  ];
}
