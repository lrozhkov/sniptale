import { translate } from '../../../../../platform/i18n';
import { normalizeVideoSceneGradientStops } from '../../../../../features/video/project/scene/gradient-stops';
import { ProductGradientPresetGrid } from '../../../../../ui/gradient-preset-grid';
import {
  VideoSceneBackgroundKind,
  VideoSceneGradientAnimationMode,
} from '../../../../../features/video/project/types';
import type { VideoSceneGradientAnimation } from '../../../../../features/video/project/types';
import { SelectInput } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import type { GradientSceneBackground, SceneBackgroundFieldProps } from './shared';

const DEFAULT_GRADIENT_ANIMATION: VideoSceneGradientAnimation = {
  mode: VideoSceneGradientAnimationMode.NONE,
  speed: 40,
  intensity: 30,
};

const VIDEO_SCENE_GRADIENT_PRESETS = [
  {
    id: 'ocean',
    labelKey: 'editor.compact.gradientOcean',
    from: '#09090b',
    to: '#2563eb',
    angle: 135,
  },
  {
    id: 'sunset',
    labelKey: 'editor.compact.gradientSunset',
    from: '#f97316',
    to: '#ec4899',
    angle: 135,
  },
  {
    id: 'aurora',
    labelKey: 'editor.compact.gradientAurora',
    from: '#27272a',
    to: '#14b8a6',
    angle: 140,
  },
  {
    id: 'mint',
    labelKey: 'editor.compact.gradientMint',
    from: '#0f766e',
    to: '#22c55e',
    angle: 135,
  },
  {
    id: 'ember',
    labelKey: 'editor.compact.gradientEmber',
    from: '#7c2d12',
    to: '#f59e0b',
    angle: 145,
  },
  {
    id: 'slate',
    labelKey: 'editor.compact.gradientSlate',
    from: '#18181b',
    to: '#52525b',
    angle: 135,
  },
] as const;

type GradientControlProps = Omit<SceneBackgroundFieldProps, 'sceneBackground'> & {
  background: GradientSceneBackground;
};

export function GradientPresetGrid(props: GradientControlProps) {
  const stops = getGradientStops(props.background);
  return (
    <div
      data-ui="shared.ui.compact-inspector.gradient-preset-field"
      className={[
        'grid min-w-0 gap-2 rounded-[10px] border px-3 py-2.5',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
      ].join(' ')}
    >
      <span
        className="min-w-0 truncate text-[12px] font-semibold text-[var(--sniptale-color-text-secondary)]"
        title={translate('videoEditor.sidebar.sceneBackgroundPresetLabel')}
      >
        {translate('videoEditor.sidebar.sceneBackgroundPresetLabel')}
      </span>
      <ProductGradientPresetGrid
        presets={VIDEO_SCENE_GRADIENT_PRESETS.map((preset) => ({
          ...preset,
          label: translate(preset.labelKey),
        }))}
        isActive={(preset) =>
          stops.length === 2 &&
          props.background.angle === preset.angle &&
          stops[0]?.color === preset.from &&
          stops.at(-1)?.color === preset.to
        }
        onSelect={(preset) =>
          props.onSetSceneBackground({
            kind: VideoSceneBackgroundKind.GRADIENT,
            angle: preset.angle,
            from: preset.from,
            to: preset.to,
            stops: [
              { color: preset.from, offset: 0 },
              { color: preset.to, offset: 1 },
            ],
            ...(props.background.animation ? { animation: props.background.animation } : {}),
          })
        }
      />
    </div>
  );
}

export function GradientAnimationControls(props: GradientControlProps) {
  const animation = props.background.animation ?? DEFAULT_GRADIENT_ANIMATION;

  return (
    <div className="space-y-3">
      <SelectInput
        label={translate('videoEditor.sidebar.sceneBackgroundAnimationModeLabel')}
        value={animation.mode}
        onChange={(mode) => updateGradientAnimation(props, { ...animation, mode })}
        options={getGradientAnimationModeOptions()}
      />
      <SliderField
        disabled={animation.mode === VideoSceneGradientAnimationMode.NONE}
        label={translate('videoEditor.sidebar.sceneBackgroundAnimationSpeedLabel')}
        value={animation.speed}
        min={0}
        max={100}
        step={1}
        onChange={(speed) => updateGradientAnimation(props, { ...animation, speed })}
        formatValue={(value) => `${Math.round(value)}%`}
      />
      <SliderField
        disabled={animation.mode === VideoSceneGradientAnimationMode.NONE}
        label={translate('videoEditor.sidebar.sceneBackgroundAnimationIntensityLabel')}
        value={animation.intensity}
        min={0}
        max={100}
        step={1}
        onChange={(intensity) => updateGradientAnimation(props, { ...animation, intensity })}
        formatValue={(value) => `${Math.round(value)}%`}
      />
    </div>
  );
}

function getGradientAnimationModeOptions() {
  return [
    {
      value: VideoSceneGradientAnimationMode.NONE,
      label: translate('videoEditor.sidebar.sceneBackgroundAnimationNone'),
    },
    {
      value: VideoSceneGradientAnimationMode.ROTATE,
      label: translate('videoEditor.sidebar.sceneBackgroundAnimationRotate'),
    },
    {
      value: VideoSceneGradientAnimationMode.BREATHE,
      label: translate('videoEditor.sidebar.sceneBackgroundAnimationBreathe'),
    },
    {
      value: VideoSceneGradientAnimationMode.AUDIO_REACTIVE,
      label: translate('videoEditor.sidebar.sceneBackgroundAnimationAudioReactive'),
    },
  ];
}

function updateGradientAnimation(
  props: GradientControlProps,
  animation: VideoSceneGradientAnimation
) {
  props.onSetSceneBackground({
    kind: VideoSceneBackgroundKind.GRADIENT,
    angle: props.background.angle,
    from: props.background.from,
    to: props.background.to,
    stops: getGradientStops(props.background),
    animation,
  });
}

function getGradientStops(background: GradientSceneBackground) {
  return normalizeVideoSceneGradientStops(background.stops, background.from, background.to);
}
