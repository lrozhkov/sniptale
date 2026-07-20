import { translate } from '../../../../platform/i18n';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { EditorInspectorFrameBackgroundFillEditor } from '../../scene';
import { FramePaddingFields } from '../../scene/padding';
import { EditorInspectorFramePreviewCard } from '../../scene/preview/card';

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
        <div className="space-y-3">
          <EditorInspectorFramePreviewCard backgroundPreviewStyle={params.backgroundPreviewStyle} />
          <EditorInspectorFrameBackgroundFillEditor
            frameDraft={params.frameDraft}
            gradientPresets={params.frameGradientPresets}
            frameBackgroundPalette={params.frameBackgroundPalette}
            frameBackgroundImageFitOptions={params.frameBackgroundImageFitOptions}
            recentColors={params.recentColors}
            toNumber={params.toNumber}
            applyGradientPreset={params.applyGradientPreset}
            previewFramePatch={(patch: Partial<typeof params.frameDraft>) => {
              params.setFrameDraft((state) => ({ ...state, ...patch }));
            }}
            applyFramePatch={(patch: Partial<typeof params.frameDraft>) => {
              params.setFrameDraft((state) => ({ ...state, ...patch }));
            }}
            onPickBackgroundImage={params.onPickBackgroundImage}
            onClearBackgroundImage={params.clearBackgroundImage}
          />
        </div>
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
        <FramePaddingFields frameDraft={params.frameDraft} setFrameDraft={params.setFrameDraft} />
      </CompactCommandField>
    ),
  };
}

export function buildFrameSurfaceCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    buildFrameBackgroundCommand(params),
    buildFramePaddingCommand(params),
    {
      id: 'frame-apply',
      title: translate('editor.compact.applyBackground'),
      trigger: <CompactCommandToken>OK</CompactCommandToken>,
      onClick: params.onApplyFrame,
    },
  ];
}
