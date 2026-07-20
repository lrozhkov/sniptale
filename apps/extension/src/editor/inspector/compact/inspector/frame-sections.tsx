import { Palette, Scaling } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { EditorInspectorFrameModeButtons } from '../../scene';
import { buildBrowserFrameBaseCommands } from './browser-frame-base-sections';
import { buildBrowserFrameDetailCommands } from './browser-frame-details';
import { buildFrameSurfaceCommands } from './frame-surface-details';

function buildFrameModeCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    {
      id: 'frame-layout-mode',
      title: translate('editor.compact.scenePlacement'),
      trigger: <Scaling size={15} strokeWidth={2} />,
      value: params.layoutModeLabel,
      content: (
        <CompactCommandField
          label={translate('editor.compact.placement')}
          value={params.layoutModeLabel}
          note={
            params.frameDraft.layoutMode === 'expand-canvas'
              ? translate('editor.compact.scenePlacementExpandNote')
              : translate('editor.compact.scenePlacementFitNote')
          }
        >
          <EditorInspectorFrameModeButtons
            ariaLabel={translate('editor.compact.placement')}
            options={params.frameLayoutModeOptions}
            value={params.frameDraft.layoutMode}
            onChange={(value) => params.setFrameDraft((state) => ({ ...state, layoutMode: value }))}
          />
        </CompactCommandField>
      ),
    },
    {
      id: 'frame-background-mode',
      title: translate('editor.compact.backgroundType'),
      trigger: <Palette size={15} strokeWidth={2} />,
      value: params.backgroundModeLabel,
      content: (
        <CompactCommandField
          label={translate('editor.compact.backgroundType')}
          value={params.backgroundModeLabel}
        >
          <EditorInspectorFrameModeButtons
            ariaLabel={translate('editor.compact.backgroundType')}
            options={params.frameBackgroundModeOptions}
            value={params.frameDraft.backgroundMode}
            onChange={(value) =>
              params.setFrameDraft((state) => ({ ...state, backgroundMode: value }))
            }
          />
        </CompactCommandField>
      ),
    },
  ];
}

export function buildFrameCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return [...buildFrameModeCommands(params), ...buildFrameSurfaceCommands(params)];
}

export function buildBrowserFrameCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return [...buildBrowserFrameBaseCommands(params), ...buildBrowserFrameDetailCommands(params)];
}
