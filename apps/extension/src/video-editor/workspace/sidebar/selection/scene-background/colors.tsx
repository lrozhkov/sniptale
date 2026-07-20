import { translate } from '../../../../../platform/i18n';
import { ColorField as CompactInspectorColorField } from '../../../../../ui/compact-inspector-controls';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import { SliderField } from '../shared/sliders';
import { GradientAnimationControls, GradientPresetGrid } from './gradient-controls';
import { GradientStopControls } from './stops';
import {
  type GradientSceneBackground,
  SCENE_BACKGROUND_PALETTE,
  type SceneBackgroundFieldProps,
} from './shared';

export function SceneBackgroundColorEditor(props: SceneBackgroundFieldProps) {
  switch (props.sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return <SolidBackgroundEditor {...props} />;
    case VideoSceneBackgroundKind.GRADIENT:
      return <GradientBackgroundEditor {...props} sceneBackground={props.sceneBackground} />;
    case VideoSceneBackgroundKind.IMAGE:
      return null;
  }
}

function SolidBackgroundEditor(props: SceneBackgroundFieldProps) {
  if (props.sceneBackground.kind !== VideoSceneBackgroundKind.SOLID) {
    return null;
  }

  const label = translate('videoEditor.sidebar.sceneBackgroundColorLabel');

  return (
    <CompactInspectorColorField
      title={label}
      label={label}
      value={props.sceneBackground.color}
      recentColors={props.recentColors}
      palette={SCENE_BACKGROUND_PALETTE}
      onChange={(color) =>
        commitSceneBackgroundColor({ kind: VideoSceneBackgroundKind.SOLID, color }, color, props)
      }
      onPreviewChange={(color) =>
        props.onPreviewSceneBackground({ kind: VideoSceneBackgroundKind.SOLID, color })
      }
      onPreviewReset={props.onResetSceneBackgroundPreview}
    />
  );
}

function GradientBackgroundEditor(
  props: Omit<SceneBackgroundFieldProps, 'sceneBackground'> & {
    sceneBackground: GradientSceneBackground;
  }
) {
  const background = props.sceneBackground;

  return (
    <>
      <GradientPresetGrid background={background} {...props} />
      <GradientStopControls background={background} {...props} />
      <SliderField
        label={translate('videoEditor.sidebar.sceneBackgroundAngleLabel')}
        value={background.angle}
        min={0}
        max={360}
        step={1}
        onChange={(value) =>
          props.onSetSceneBackground({
            kind: VideoSceneBackgroundKind.GRADIENT,
            angle: value,
            from: background.from,
            to: background.to,
            ...(background.stops ? { stops: background.stops } : {}),
            ...(background.animation ? { animation: background.animation } : {}),
          })
        }
        formatValue={(value) => `${Math.round(value)}°`}
      />
      <GradientAnimationControls background={background} {...props} />
    </>
  );
}

function commitSceneBackgroundColor(
  sceneBackground: NonNullable<SceneBackgroundFieldProps['sceneBackground']>,
  color: string,
  props: Pick<
    SceneBackgroundFieldProps,
    'onRememberRecentColor' | 'onResetSceneBackgroundPreview' | 'onSetSceneBackground'
  >
) {
  props.onSetSceneBackground(sceneBackground);
  props.onResetSceneBackgroundPreview();
  void props.onRememberRecentColor(color);
}
