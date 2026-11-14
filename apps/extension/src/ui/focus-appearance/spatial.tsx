import { translate } from '../../platform/i18n';
import { SegmentedRow, ToggleField } from '../compact-inspector-controls';
import { PreviewNumericRow } from '../compact-inspector-controls/numeric-preview';
import {
  DEFAULT_CAMERA_PERSPECTIVE,
  type CameraPerspective,
  type CameraSpatialMotion,
} from '../../features/video/project/motion/spatial';

/** Motion authoring changes only pose data; the consuming editor owns drafts, Undo and persistence. */
export function SpatialMotionFields(props: {
  perspective?: CameraPerspective | undefined;
  value?: CameraSpatialMotion | undefined;
  onChange(value: CameraSpatialMotion): void;
  onPreview?(value: CameraSpatialMotion | null): void;
}) {
  const base = props.perspective ?? DEFAULT_CAMERA_PERSPECTIVE;
  const value = props.value ?? {
    enabled: false,
    end: { ...base, rotateY: -base.rotateY },
    easing: 'ease-in-out',
  };
  return (
    <div className="sniptale-parameter-stack" data-ui="focus.spatialMotion">
      <ToggleField
        label={translate('gallery.videoReview.spatialMotion')}
        value={value.enabled}
        onChange={(enabled) => props.onChange({ ...value, enabled })}
      />
      {value.enabled ? (
        <>
          <SegmentedRow<'orbit' | 'rise' | 'roll'>
            layout="stacked"
            columns={3}
            label={translate('gallery.videoReview.spatialMotionPreset')}
            ariaLabel={translate('gallery.videoReview.spatialMotionPreset')}
            value={
              value.end.rotateX !== base.rotateX
                ? 'rise'
                : value.end.rotateZ !== base.rotateZ
                  ? 'roll'
                  : 'orbit'
            }
            options={[
              { value: 'orbit', label: translate('gallery.videoReview.spatialMotionOrbit') },
              { value: 'rise', label: translate('gallery.videoReview.spatialMotionRise') },
              { value: 'roll', label: translate('gallery.videoReview.spatialMotionRoll') },
            ]}
            onChange={(preset) =>
              props.onChange({
                ...value,
                end: {
                  ...base,
                  enabled: true,
                  ...(preset === 'orbit'
                    ? { rotateY: -base.rotateY || -18 }
                    : preset === 'rise'
                      ? { rotateX: Math.max(-60, base.rotateX - 15) }
                      : { rotateZ: Math.min(180, base.rotateZ + 12) }),
                },
              })
            }
          />
          <SegmentedRow
            layout="stacked"
            columns={2}
            label={translate('gallery.videoReview.spatialMotionEasing')}
            ariaLabel={translate('gallery.videoReview.spatialMotionEasing')}
            value={value.easing}
            options={[
              {
                value: 'linear' as const,
                label: translate('gallery.videoReview.transitionLinear'),
              },
              {
                value: 'ease-in-out' as const,
                label: translate('gallery.videoReview.transitionSmooth'),
              },
            ]}
            onChange={(easing) => props.onChange({ ...value, easing })}
          />
          {(['rotateX', 'rotateY', 'rotateZ'] as const).map((key) => (
            <PreviewNumericRow
              key={key}
              label={translate(
                key === 'rotateX'
                  ? 'gallery.videoReview.spatialMotionEndX'
                  : key === 'rotateY'
                    ? 'gallery.videoReview.spatialMotionEndY'
                    : 'gallery.videoReview.spatialMotionEndZ'
              )}
              value={value.end[key]}
              min={key === 'rotateZ' ? -180 : -60}
              max={key === 'rotateZ' ? 180 : 60}
              unit="deg"
              step={0.1}
              precision={1}
              onPreview={(next) =>
                props.onPreview?.(
                  next === null ? null : { ...value, end: { ...value.end, [key]: next } }
                )
              }
              onChange={(next) => props.onChange({ ...value, end: { ...value.end, [key]: next } })}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
