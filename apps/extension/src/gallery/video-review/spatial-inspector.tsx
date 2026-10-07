import { ReviewPreviewNumberRow } from './number-row';
import { SelectField } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import {
  DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
} from '../../features/video/review/advanced/spatial';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { ReviewButton, ReviewDetails, reviewSelectFieldClassName } from './controls';

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
  region: QuickEditZoomRegion;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
};

/** Rare spatial controls share zoom timing and stay inside remembered, collapsed groups. */
export function ReviewSpatialInspector(props: Props) {
  const perspective = props.region.perspective ?? DEFAULT_QUICK_EDIT_PERSPECTIVE;
  const depth = props.region.depthOfField ?? DEFAULT_QUICK_EDIT_DEPTH;
  const badge = (enabled: boolean) =>
    enabled ? ` · ${translate('gallery.videoReview.spatialOn')}` : '';
  return (
    <>
      <ReviewDetails
        preferenceId="gallery.videoReview.perspective"
        label={translate('gallery.videoReview.perspective') + badge(perspective.enabled)}
      >
        <SpatialToggle
          enabled={perspective.enabled}
          onChange={(enabled) => props.onChange({ perspective: { ...perspective, enabled } })}
        />
        {perspective.enabled ? (
          <>
            {(['rotateX', 'rotateY', 'rotateZ', 'strength'] as const).map((key) => {
              const angle = key !== 'strength';
              const limit = key === 'rotateZ' ? 180 : 60;
              return (
                <ReviewPreviewNumberRow
                  step={1}
                  key={key}
                  unit={angle ? 'deg' : '%'}
                  label={translate(perspectiveLabels[key])}
                  value={perspective[key] * (angle ? 1 : 100)}
                  min={angle ? -limit : 0}
                  max={angle ? limit : 100}
                  onPreview={(value) =>
                    props.onPreview?.(
                      value === null
                        ? null
                        : { perspective: { ...perspective, [key]: value / (angle ? 1 : 100) } }
                    )
                  }
                  onChange={(value) =>
                    props.onChange({
                      perspective: { ...perspective, [key]: value / (angle ? 1 : 100) },
                    })
                  }
                />
              );
            })}
            <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.perspectiveBackground')}
            </p>
          </>
        ) : null}
        <ReviewButton
          label={translate('gallery.videoReview.spatialReset')}
          onClick={() => props.onChange({ perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE } })}
        />
      </ReviewDetails>
      <ReviewDetails
        preferenceId="gallery.videoReview.depthOfField"
        label={translate('gallery.videoReview.depthOfField') + badge(depth.enabled)}
      >
        <SpatialToggle
          enabled={depth.enabled}
          onChange={(enabled) => props.onChange({ depthOfField: { ...depth, enabled } })}
        />
        {depth.enabled ? (
          <>
            <SelectField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.depthMode')}
              value={depth.mode}
              options={[
                { value: 'depth', label: translate('gallery.videoReview.depthModeDepth') },
                { value: 'area', label: translate('gallery.videoReview.depthModeArea') },
              ]}
              onChange={(mode: 'depth' | 'area') =>
                props.onChange({ depthOfField: { ...depth, mode } })
              }
            />
            {(['x', 'y', 'width', 'softness', 'strength'] as const).map((key) => (
              <ReviewPreviewNumberRow
                step={1}
                key={key}
                unit="%"
                label={translate(depthLabels[key])}
                value={depth[key] * 100}
                min={key === 'softness' ? 1 : 0}
                max={100}
                onPreview={(value) =>
                  props.onPreview?.(
                    value === null ? null : { depthOfField: { ...depth, [key]: value / 100 } }
                  )
                }
                onChange={(value) =>
                  props.onChange({ depthOfField: { ...depth, [key]: value / 100 } })
                }
              />
            ))}
          </>
        ) : null}
        <ReviewButton
          label={translate('gallery.videoReview.spatialReset')}
          onClick={() => props.onChange({ depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH } })}
        />
      </ReviewDetails>
    </>
  );
}

function SpatialToggle(props: { enabled: boolean; onChange(enabled: boolean): void }) {
  return (
    <SelectField
      className={reviewSelectFieldClassName}
      label={translate('gallery.videoReview.spatialEnabled')}
      value={props.enabled ? 'on' : 'off'}
      options={[
        { value: 'off', label: translate('gallery.videoReview.motionBlurOff') },
        { value: 'on', label: translate('gallery.videoReview.motionBlurOn') },
      ]}
      onChange={(value: 'on' | 'off') => props.onChange(value === 'on')}
    />
  );
}
