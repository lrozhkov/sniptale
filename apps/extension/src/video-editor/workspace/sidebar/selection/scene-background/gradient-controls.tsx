import { translate } from '../../../../../platform/i18n';
import { VideoSceneGradientAnimationMode } from '../../../../../features/video/project/types';
import type { VideoSceneGradientAnimation } from '../../../../../features/video/project/types';
import { SelectInput } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import type { GradientSceneBackground, SceneBackgroundFieldProps } from './shared';

const DEFAULT_GRADIENT_ANIMATION: VideoSceneGradientAnimation = {
  mode: VideoSceneGradientAnimationMode.NONE,
  speed: 40,
  intensity: 30,
};

type GradientControlProps = Omit<SceneBackgroundFieldProps, 'sceneBackground'> & {
  background: GradientSceneBackground;
};

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
      {animation.mode !== VideoSceneGradientAnimationMode.NONE &&
        animation.mode !== VideoSceneGradientAnimationMode.AUDIO_REACTIVE && (
          <SliderField
            label={translate('videoEditor.sidebar.sceneBackgroundAnimationSpeedLabel')}
            value={animation.speed}
            min={0}
            max={100}
            step={1}
            onChange={(speed) => updateGradientAnimation(props, { ...animation, speed })}
            formatValue={(value) => `${Math.round(value)}%`}
          />
        )}
      {animation.mode !== VideoSceneGradientAnimationMode.NONE && (
        <SliderField
          label={translate('videoEditor.sidebar.sceneBackgroundAnimationIntensityLabel')}
          value={animation.intensity}
          min={0}
          max={100}
          step={1}
          onChange={(intensity) => updateGradientAnimation(props, { ...animation, intensity })}
          formatValue={(value) => `${Math.round(value)}%`}
        />
      )}
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
      value: VideoSceneGradientAnimationMode.DRIFT,
      label: translate('videoEditor.sidebar.sceneBackgroundAnimationDrift'),
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
  props.onSetSceneBackground({ ...props.background, animation });
}
