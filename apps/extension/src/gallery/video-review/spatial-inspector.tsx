import { ReviewPreviewNumberRow } from './number-row';
import { translate } from '../../platform/i18n';
import {
  DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
} from '../../features/video/review/advanced/spatial';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import type { SpatialTool } from './spatial-gesture';
import { ReviewDetails } from './controls';

const perspectiveLabels = {
  rotateX: 'gallery.videoReview.perspectiveX',
  rotateY: 'gallery.videoReview.perspectiveY',
  rotateZ: 'gallery.videoReview.perspectiveZ',
  strength: 'gallery.videoReview.perspectiveStrength',
} as const;
const depthLabels = {
  x: 'gallery.videoReview.depthX',
  y: 'gallery.videoReview.depthY',
  width: 'gallery.videoReview.depthWidth',
  softness: 'gallery.videoReview.depthSoftness',
  strength: 'gallery.videoReview.depthStrength',
} as const;

type Props = {
  tool: Exclude<SpatialTool, 'position'>;
  region: QuickEditZoomRegion;
  previewRegion?: QuickEditZoomRegion | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
};

/** Exact fields follow the preview tool; navigation never enables an authored effect. */
export function ReviewSpatialInspector(props: Props) {
  const perspective = props.region.perspective ?? DEFAULT_QUICK_EDIT_PERSPECTIVE;
  const depth = props.region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH;
  const depthField = (key: keyof typeof depthLabels) => (
    <ReviewPreviewNumberRow
      enterBehavior="blur"
      step={0.1}
      precision={1}
      key={key}
      unit="%"
      label={translate(depthLabels[key])}
      value={depth[key] * 100}
      previewValue={
        props.previewRegion?.depthOfField ? props.previewRegion.depthOfField[key] * 100 : undefined
      }
      min={key === 'softness' ? 1 : 0}
      max={100}
      onPreview={(value) =>
        props.onPreview?.(
          value === null || value / 100 === depth[key]
            ? null
            : { depthOfField: { ...depth, enabled: true, [key]: value / 100 } }
        )
      }
      onChange={(value) => {
        if (value / 100 !== depth[key])
          props.onChange({ depthOfField: { ...depth, enabled: true, [key]: value / 100 } });
      }}
    />
  );
  return (
    <>
      {props.tool !== 'focus' ? (
        <div className="sniptale-parameter-stack">
          {(props.tool === 'rotation'
            ? (['rotateZ'] as const)
            : (['rotateX', 'rotateY', 'strength'] as const)
          ).map((key) => {
            const angle = key !== 'strength';
            const limit = key === 'rotateZ' ? 180 : 60;
            return (
              <ReviewPreviewNumberRow
                enterBehavior="blur"
                step={0.1}
                precision={1}
                key={key}
                unit={angle ? 'deg' : '%'}
                label={translate(perspectiveLabels[key])}
                value={perspective[key] * (angle ? 1 : 100)}
                previewValue={
                  props.previewRegion?.perspective
                    ? props.previewRegion.perspective[key] * (angle ? 1 : 100)
                    : undefined
                }
                min={angle ? -limit : 0}
                max={angle ? limit : 100}
                onPreview={(value) =>
                  props.onPreview?.(
                    value === null || value / (angle ? 1 : 100) === perspective[key]
                      ? null
                      : {
                          perspective: {
                            ...perspective,
                            enabled: true,
                            [key]: value / (angle ? 1 : 100),
                          },
                        }
                  )
                }
                onChange={(value) => {
                  if (value / (angle ? 1 : 100) === perspective[key]) return;
                  props.onChange({
                    perspective: {
                      ...perspective,
                      enabled: true,
                      [key]: value / (angle ? 1 : 100),
                    },
                  });
                }}
              />
            );
          })}
        </div>
      ) : (
        <>
          {depthField('strength')}
          {depthField('softness')}
          <ReviewDetails
            preferenceId="gallery.videoReview.depthOfField"
            label={translate('gallery.videoReview.precisePosition')}
          >
            {depthField('x')}
            {depthField('y')}
            {depthField('width')}
          </ReviewDetails>
        </>
      )}
    </>
  );
}
