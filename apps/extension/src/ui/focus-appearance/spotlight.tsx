import type { ComponentType } from 'react';
import type { QuickEditSpotlight } from '../../features/video/project/scene/focus-appearance';
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
      <SegmentedRow<QuickEditSpotlight['effect']>
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
      ) : (
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
      )}
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
    </div>
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
