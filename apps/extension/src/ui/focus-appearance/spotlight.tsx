import type { ComponentType } from 'react';
import type { QuickEditSpotlight } from '../../features/video/project/scene/focus-appearance';
import { authorQuickEditLensArea } from '../../features/video/project/scene/focus-appearance';
import { FocusRoundnessField, FocusAreaFields } from './geometry';
import { translate } from '../../platform/i18n';
import { SegmentedRow } from '../compact-inspector-controls';
import { PreviewNumericRow } from '../compact-inspector-controls/numeric-preview';
import type { InspectorDisclosureProps } from '../compact-inspector-controls/shared';

export type SpotlightAppearancePatch = Omit<Partial<QuickEditSpotlight>, 'area'> & {
  area?: Partial<QuickEditSpotlight['area']>;
};

/** Controlled fields share geometry and gestures. Each editor owns current-state edits and disclosure scope. */
export function SpotlightAppearanceFields(props: {
  value: QuickEditSpotlight;
  onChange(patch: SpotlightAppearancePatch): void;
  onPreview?: ((patch: SpotlightAppearancePatch | null) => void) | undefined;
  Details: ComponentType<InspectorDisclosureProps>;
  preferenceId: string;
}) {
  const { value, onChange, Details } = props;
  return (
    <div className="sniptale-parameter-stack">
      {value.effect === 'magnify' ? (
        <>
          <LensShapeFields value={value} onChange={onChange} onPreview={props.onPreview} />
          <PreviewNumericRow
            label={translate('gallery.videoReview.clickMagnification')}
            min={1}
            max={4}
            step={0.1}
            precision={2}
            unit="x"
            value={value.magnification ?? 2}
            onPreview={(magnification) =>
              props.onPreview?.(magnification === null ? null : { magnification })
            }
            onChange={(magnification) => onChange({ magnification })}
          />
          <SegmentedRow<'flat' | 'optical'>
            columns={2}
            layout="stacked"
            label={translate('gallery.videoReview.clickLensOptics')}
            ariaLabel={translate('gallery.videoReview.clickLensOptics')}
            value={value.lensOptics ?? 'flat'}
            options={[
              { value: 'flat', label: translate('gallery.videoReview.clickLensOptics_flat') },
              { value: 'optical', label: translate('gallery.videoReview.clickLensOptics_optical') },
            ]}
            onChange={(lensOptics) => onChange({ lensOptics })}
          />
          {value.lensOptics === 'optical' ? (
            <PreviewNumericRow
              label={translate('gallery.videoReview.clickLensEdgeWidth')}
              min={1}
              max={30}
              step={1}
              precision={0}
              unit="%"
              value={value.lensEdgeWidth ?? 8}
              onPreview={(lensEdgeWidth) =>
                props.onPreview?.(lensEdgeWidth === null ? null : { lensEdgeWidth })
              }
              onChange={(lensEdgeWidth) => onChange({ lensEdgeWidth })}
            />
          ) : null}
        </>
      ) : (
        <SegmentedRow<'dim' | 'blur'>
          columns={2}
          layout="stacked"
          label={translate('gallery.videoReview.focusOutside')}
          ariaLabel={translate('gallery.videoReview.focusOutside')}
          value={value.effect}
          options={[
            { value: 'dim', label: translate('gallery.videoReview.focusDim') },
            { value: 'blur', label: translate('gallery.videoReview.focusBlur') },
          ]}
          onChange={(effect) => onChange({ effect })}
        />
      )}
      {value.effect === 'dim' ? (
        <PreviewNumericRow
          label={translate('gallery.videoReview.focusStrength')}
          min={0}
          max={100}
          step={1}
          precision={0}
          unit="%"
          value={value.strength * 100}
          onPreview={(strength) =>
            props.onPreview?.(strength === null ? null : { strength: strength / 100 })
          }
          onChange={(strength) => onChange({ strength: strength / 100 })}
        />
      ) : value.effect === 'blur' ? (
        <PreviewNumericRow
          label={translate('gallery.videoReview.focusBlurRadius')}
          min={0}
          max={40}
          step={1}
          precision={1}
          unit="px"
          value={value.blur}
          onPreview={(blur) => props.onPreview?.(blur === null ? null : { blur })}
          onChange={(blur) => onChange({ blur })}
        />
      ) : null}
      {value.effect !== 'magnify' || value.lensShape !== 'circle' ? (
        <>
          <FocusRoundnessField
            value={value.roundness}
            onPreview={(roundness) => props.onPreview?.(roundness === null ? null : { roundness })}
            onChange={(roundness) => onChange({ roundness })}
          />
          <Details
            preferenceId={props.preferenceId}
            label={translate('gallery.videoReview.preciseArea')}
          >
            <FocusAreaFields
              area={value.area}
              onPreview={(area) => props.onPreview?.(area === null ? null : { area })}
              onChange={(area) => onChange({ area })}
            />
          </Details>
        </>
      ) : null}
    </div>
  );
}

function LensShapeFields(props: {
  value: QuickEditSpotlight;
  onChange(patch: SpotlightAppearancePatch): void;
  onPreview?: ((patch: SpotlightAppearancePatch | null) => void) | undefined;
}) {
  const { value } = props;
  const sizePatch = (diameter: number) => {
    const center = {
      x: value.area.x + value.area.width / 2,
      y: value.area.y + value.area.height / 2,
    };
    const size = diameter / 100;
    return {
      area: authorQuickEditLensArea(value, {
        x: center.x - size / 2,
        y: center.y - size / 2,
        width: size,
        height: size,
      }),
    };
  };
  return (
    <>
      <SegmentedRow<'circle' | 'rounded'>
        columns={2}
        layout="stacked"
        label={translate('gallery.videoReview.clickLensShape')}
        ariaLabel={translate('gallery.videoReview.clickLensShape')}
        value={value.lensShape ?? 'rounded'}
        options={[
          { value: 'circle', label: translate('gallery.videoReview.clickLens_circle') },
          { value: 'rounded', label: translate('gallery.videoReview.focusLensRounded') },
        ]}
        onChange={(lensShape) => {
          if (lensShape !== (value.lensShape ?? 'rounded')) props.onChange({ lensShape });
        }}
      />
      {value.lensShape === 'circle' ? (
        <div className="grid gap-1">
          <PreviewNumericRow
            label={translate('gallery.videoReview.focusLensDiameter')}
            min={1}
            max={100}
            step={1}
            precision={1}
            unit="%"
            value={Math.max(value.area.width, value.area.height) * 100}
            onPreview={(size) => props.onPreview?.(size === null ? null : sizePatch(size))}
            onChange={(size) => props.onChange(sizePatch(size))}
          />
          <p className="m-0 text-[12px] leading-4 text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.videoReview.focusLensDiameterHint')}
          </p>
        </div>
      ) : null}
    </>
  );
}

/** Reveal choices are shared; adapters retain their own phase activation and duration policy. */
export function SpotlightRevealFields(props: {
  phase: 'enter' | 'exit';
  value: QuickEditSpotlight['reveal'];
  enabled?: boolean;
  onChange(value: QuickEditSpotlight['reveal'] | 'none'): void;
}) {
  return (
    <SegmentedRow<QuickEditSpotlight['reveal'] | 'none'>
      columns={props.enabled === undefined ? 2 : 3}
      layout="stacked"
      label={translate('gallery.videoReview.focusReveal')}
      ariaLabel={translate('gallery.videoReview.focusReveal')}
      value={props.enabled === false ? 'none' : props.value}
      options={[
        ...(props.enabled === undefined
          ? []
          : [
              {
                value: 'none' as const,
                label: translate(
                  props.phase === 'enter'
                    ? 'gallery.videoReview.borderAppear'
                    : 'gallery.videoReview.borderDisappear'
                ),
              },
            ]),
        { value: 'fade', label: translate('gallery.videoReview.focusFade') },
        {
          value: 'contract',
          label: translate(
            props.phase === 'enter'
              ? 'gallery.videoReview.focusContract'
              : 'gallery.videoReview.focusExpand'
          ),
        },
      ]}
      onChange={props.onChange}
    />
  );
}
