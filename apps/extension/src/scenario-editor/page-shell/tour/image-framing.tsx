import type { TourDocument, TourImageSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { Translate } from '../../../platform/i18n';
import { TourStage } from './stage';
import { TourInspectorNumericRow } from './numeric-row';

/** Placement controls and the real renderer share one bitmap projection and existing history writer. */
export function TourImageFraming({
  tour,
  slide,
  images,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  slide: TourImageSlide;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (slide: TourImageSlide) => boolean;
  t: Translate;
}) {
  if (!slide.image) return null;
  const placement = slide.imagePlacement ?? { center: { x: 0.5, y: 0.5 }, zoom: 1 };
  return (
    <div data-ui="tour.image.framing" className="tour-image-framing sniptale-parameter-stack">
      {images[slide.image.assetId] && (
        <div className="tour-image-framing-preview">
          <TourStage
            tour={tour}
            images={images}
            selection={{ kind: 'slide', slideId: slide.id, objectId: null }}
            disabled={disabled}
            view="image"
            onSelectObject={() => {}}
            onMoveObject={() => {}}
            onFrameImage={(imagePlacement) => onChange({ ...slide, imagePlacement })}
            t={t}
          />
        </div>
      )}
      {(['x', 'y'] as const).map((axis) => (
        <TourInspectorNumericRow
          key={axis}
          label={t(
            axis === 'x'
              ? 'scenario.editor.tourImagePositionX'
              : 'scenario.editor.tourImagePositionY'
          )}
          value={placement.center[axis] * 100}
          unit="%"
          min={0}
          max={100}
          precision={1}
          step={0.1}
          disabled={disabled}
          onChange={(value) =>
            onChange({
              ...slide,
              imagePlacement: {
                ...placement,
                center: { ...placement.center, [axis]: value / 100 },
              },
            })
          }
        />
      ))}
      <TourInspectorNumericRow
        label={t('scenario.editor.tourImageScale')}
        value={placement.zoom * 100}
        unit="%"
        min={100}
        max={800}
        step={1}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...slide, imagePlacement: { ...placement, zoom: value / 100 } })
        }
      />
    </div>
  );
}
