import type { ComponentType, ReactNode } from 'react';
import { Circle, Contrast, Droplet, RectangleHorizontal } from 'lucide-react';
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
  framing?: {
    renderChoice(choice: ReactNode): ReactNode;
    lensPlacement?: ReactNode;
  };
}) {
  const { value, onChange, Details } = props;
  const lensFraming = value.effect === 'magnify' ? props.framing : undefined;
  const areaProps = {
    area: value.area,
    onPreview: (area: QuickEditSpotlight['area'] | null) =>
      props.onPreview?.(area === null ? null : { area }),
    onChange: (area: QuickEditSpotlight['area']) => onChange({ area }),
  };
  return (
    <div className="sniptale-parameter-stack">
      {value.effect === 'magnify' ? (
        <>
          {lensFraming ? (
            <>
              {lensFraming.renderChoice(
                <LensShapeChoice value={value} onChange={onChange} visual />
              )}
              {lensFraming.lensPlacement}
            </>
          ) : (
            <LensShapeChoice value={value} onChange={onChange} />
          )}
          {value.lensShape === 'circle' ? (
            <LensDiameterField value={value} onChange={onChange} onPreview={props.onPreview} />
          ) : lensFraming ? (
            <FocusAreaFields {...areaProps} fields="size" />
          ) : null}
          <PreviewNumericRow
            label={translate('gallery.videoReview.focusLensMagnification')}
            rangePresentation="field"
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
              rangePresentation={lensFraming ? 'field' : undefined}
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
      ) : props.framing ? (
        props.framing.renderChoice(
          <SpotlightModeChoice value={value.effect} onChange={onChange} visual />
        )
      ) : (
        <SpotlightModeChoice value={value.effect} onChange={onChange} />
      )}
      {value.effect === 'dim' ? (
        <PreviewNumericRow
          label={translate('gallery.videoReview.focusStrength')}
          rangePresentation="field"
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
          rangePresentation="field"
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
            label={translate(
              lensFraming
                ? 'gallery.videoReview.precisePosition'
                : 'gallery.videoReview.preciseArea'
            )}
          >
            <FocusAreaFields {...areaProps} fields={lensFraming ? 'position' : undefined} />
          </Details>
        </>
      ) : null}
    </div>
  );
}

function SpotlightModeChoice(props: {
  value: 'dim' | 'blur';
  onChange(patch: SpotlightAppearancePatch): void;
  visual?: boolean;
}) {
  const label = translate('gallery.videoReview.focusOutside');
  return (
    <SegmentedRow<'dim' | 'blur'>
      columns={2}
      layout={props.visual ? 'stacked' : 'inline'}
      label={label}
      ariaLabel={label}
      showOptionLabels={props.visual}
      value={props.value}
      options={[
        {
          value: 'dim',
          label: translate('gallery.videoReview.focusDim'),
          icon: props.visual ? <Contrast size={19} strokeWidth={1.5} aria-hidden /> : undefined,
        },
        {
          value: 'blur',
          label: translate('gallery.videoReview.focusBlur'),
          icon: props.visual ? <Droplet size={19} strokeWidth={1.5} aria-hidden /> : undefined,
        },
      ]}
      onChange={(effect) => props.onChange({ effect })}
    />
  );
}

function LensShapeChoice({
  value,
  onChange,
  visual,
}: {
  value: QuickEditSpotlight;
  onChange(patch: SpotlightAppearancePatch): void;
  visual?: boolean;
}) {
  const label = translate('gallery.videoReview.clickLensShape');
  const shape = value.lensShape ?? 'rounded';
  return (
    <SegmentedRow<'circle' | 'rounded'>
      columns={2}
      layout={visual ? 'stacked' : 'inline'}
      label={label}
      ariaLabel={label}
      showOptionLabels={visual}
      value={shape}
      options={[
        {
          value: 'circle',
          label: translate('gallery.videoReview.clickLens_circle'),
          icon: visual ? <Circle size={19} strokeWidth={1.5} aria-hidden /> : undefined,
        },
        {
          value: 'rounded',
          label: translate('gallery.videoReview.focusLensRounded'),
          icon: visual ? (
            <RectangleHorizontal size={21} strokeWidth={1.5} aria-hidden />
          ) : undefined,
        },
      ]}
      onChange={(lensShape) => {
        if (lensShape !== shape) onChange({ lensShape });
      }}
    />
  );
}

function LensDiameterField(props: {
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
      label={translate('gallery.videoReview.spotlightRevealLabel')}
      ariaLabel={translate('gallery.videoReview.spotlightRevealLabel')}
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
        { value: 'fade', label: translate('gallery.videoReview.spotlightFade') },
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
