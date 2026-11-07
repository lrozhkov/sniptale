import { RotateCcw } from 'lucide-react';
import {
  changeFrameBackgroundMode,
  resetFrameBackground,
  isFrameBackgroundDefault,
  isFrameBackgroundNone,
} from '../../scene/background/settings';
import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { EditorInspectorFramePanel } from '../../scene/panel';
import { FramePaddingFields } from '../../scene/padding';

function buildFrameBackgroundCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'frame-background-fill',
    icon: 'color',
    title: translate('editor.compact.sceneBackground'),
    trigger: <CompactCommandToken>BG</CompactCommandToken>,
    value: params.backgroundSummary,
    content: (
      <CompactCommandField
        label={translate('editor.compact.sceneBackground')}
        value={params.backgroundSummary}
      >
        <EditorInspectorFramePanel
          scenePresetHeader={null}
          frameDraft={params.frameDraft}
          lastFillModeRef={params.lastFillModeRef}
          backgroundPreviewStyle={params.backgroundPreviewStyle}
          framePaddingSummary={params.framePaddingSummary}
          frameLayoutModeOptions={params.frameLayoutModeOptions}
          frameBackgroundModeOptions={params.frameBackgroundModeOptions}
          gradientPresets={params.frameGradientPresets}
          frameBackgroundPalette={params.frameBackgroundPalette}
          frameBackgroundImageFitOptions={params.frameBackgroundImageFitOptions}
          lineStyleOptions={params.lineStyleOptions}
          shapeStrokePalette={params.shapeStrokePalette}
          recentColors={params.recentColors}
          toNumber={params.toNumber}
          setFrameDraft={params.setFrameDraft}
          previewFrameDraft={params.previewFrameDraft}
          setLayoutMode={(layoutMode) =>
            params.setFrameDraft((state) => ({ ...state, layoutMode }))
          }
          setBackgroundMode={(mode) =>
            params.setFrameDraft((state) => changeFrameBackgroundMode(state, mode))
          }
          applyGradientPreset={params.applyGradientPreset}
          previewFramePatch={(patch) =>
            params.previewFrameDraft?.((state) => ({ ...state, ...patch }))
          }
          applyFramePatch={(patch) => params.setFrameDraft((state) => ({ ...state, ...patch }))}
          onPickBackgroundImage={params.onPickBackgroundImage}
          onClearBackgroundImage={params.clearBackgroundImage}
          onApplyFrame={params.onApplyFrame}
        />
      </CompactCommandField>
    ),
  };
}

function buildFramePaddingCommand(params: InspectorCommandParams): CompactCommand {
  return {
    id: 'frame-padding',
    icon: 'size',
    title: translate('editor.compact.scenePadding'),
    trigger: <CompactCommandToken>PAD</CompactCommandToken>,
    value: params.framePaddingSummary,
    content: (
      <CompactCommandField
        label={translate('editor.compact.scenePadding')}
        value={params.framePaddingSummary}
      >
        <FramePaddingFields
          frameDraft={params.frameDraft}
          setFrameDraft={params.setFrameDraft}
          previewFrameDraft={params.previewFrameDraft}
        />
      </CompactCommandField>
    ),
  };
}

export function buildFrameSurfaceCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    buildFrameBackgroundCommand(params),
    ...(!isFrameBackgroundNone(params.frameDraft)
      ? [
          buildFramePaddingCommand(params),
          {
            id: 'frame-apply',
            title: translate('editor.scene.resetBackground'),
            disabled: isFrameBackgroundDefault(params.frameDraft),
            trigger: <RotateCcw size={15} aria-hidden="true" />,
            onClick: () => params.setFrameDraft(resetFrameBackground),
          },
        ]
      : []),
  ];
}
