import { createSolidPaint, getRepresentativeColor, type Paint } from '@sniptale/foundation/paint';
import { translate } from '../../../../../platform/i18n';
import { CompactPaintSelector } from '../../../../../ui/paint-selector';
import {
  VideoSceneBackgroundKind,
  type VideoProjectSceneBackground,
} from '../../../../../features/video/project/types';
import { GradientAnimationControls } from './gradient-controls';
import { SCENE_BACKGROUND_PALETTE, type SceneBackgroundFieldProps } from './shared';

export function SceneBackgroundColorEditor(props: SceneBackgroundFieldProps) {
  const background = props.sceneBackground;
  if (background.kind === VideoSceneBackgroundKind.IMAGE) return null;
  const value: Paint =
    background.kind === VideoSceneBackgroundKind.SOLID
      ? createSolidPaint(background.color)
      : { kind: 'gradient', gradient: background.gradient };
  const toBackground = (paint: Paint): VideoProjectSceneBackground =>
    paint.kind === 'solid'
      ? { kind: VideoSceneBackgroundKind.SOLID, color: paint.color }
      : {
          kind: VideoSceneBackgroundKind.GRADIENT,
          gradient: paint.gradient,
          ...(background.kind === VideoSceneBackgroundKind.GRADIENT && background.animation
            ? { animation: background.animation }
            : {}),
        };
  const label = translate('videoEditor.sidebar.sceneBackgroundColorLabel');
  return (
    <>
      <CompactPaintSelector
        label={label}
        title={label}
        value={value}
        recentColors={props.recentColors}
        palette={SCENE_BACKGROUND_PALETTE}
        onChange={(paint) => {
          props.onSetSceneBackground(toBackground(paint));
          props.onResetSceneBackgroundPreview();
          void props.onRememberRecentColor(getRepresentativeColor(paint));
        }}
        onPreviewChange={(paint) => props.onPreviewSceneBackground(toBackground(paint))}
        onPreviewReset={props.onResetSceneBackgroundPreview}
      />
      {background.kind === VideoSceneBackgroundKind.GRADIENT && (
        <GradientAnimationControls background={background} {...props} />
      )}
    </>
  );
}
