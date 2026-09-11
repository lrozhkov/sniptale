import {
  serializePaintToCss,
  createSolidPaint,
  getRepresentativeColor,
  type Paint,
} from '@sniptale/foundation/paint';
import { useGradientPresetCatalog } from '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { translate } from '../../../../../platform/i18n';
import { CompactPaintSelector } from '../../../../../ui/paint-selector';
import {
  VideoSceneBackgroundKind,
  type VideoProjectSceneBackground,
} from '../../../../../features/video/project/types';
import { GradientAnimationControls } from './gradient-controls';
import { SCENE_BACKGROUND_PALETTE, type SceneBackgroundFieldProps } from './shared';

export function SceneBackgroundColorEditor(props: SceneBackgroundFieldProps) {
  const { presets } = useGradientPresetCatalog('highlighter-frame-fill');
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
      {background.kind === VideoSceneBackgroundKind.GRADIENT && (
        <div
          className="grid grid-cols-5 gap-2"
          role="group"
          aria-label={translate('videoEditor.sidebar.sceneBackgroundPresetLabel')}
        >
          {presets
            .filter((preset) => preset.enabled)
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order)
            .slice(0, 10)
            .map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                aria-label={preset.name}
                aria-pressed={
                  serializePaintToCss(value) ===
                  serializePaintToCss({ kind: 'gradient', gradient: preset.gradient })
                }
                className={[
                  'h-8 min-w-0 rounded border border-[var(--sniptale-color-border-subtle)]',
                  'transition-opacity hover:opacity-80',
                  'aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-2',
                  'aria-pressed:outline-[var(--sniptale-color-accent)]',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-[var(--sniptale-color-accent)]',
                ].join(' ')}
                style={{
                  background: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
                }}
                onClick={() => {
                  props.onSetSceneBackground(
                    toBackground({ kind: 'gradient', gradient: preset.gradient })
                  );
                  props.onResetSceneBackgroundPreview();
                }}
              />
            ))}
        </div>
      )}
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
