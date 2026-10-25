import { normalizePaintColor } from '@sniptale/foundation/paint';
import type { ComponentType } from 'react';
import type { QuickEditBorder } from '../../features/video/project/scene/focus-appearance';
import { FocusRoundnessField, FocusAreaFields } from './geometry';
import { RotateCw, RotateCcw } from 'lucide-react';
import { ColorField, SegmentedRow, SelectField } from '../compact-inspector-controls';
import { PreviewNumericRow } from '../compact-inspector-controls/numeric-preview';
import type { InspectorDisclosureProps } from '../compact-inspector-controls/shared';
import { translate } from '../../platform/i18n';

export type BorderAppearancePatch = Omit<Partial<QuickEditBorder>, 'area'> & {
  area?: Partial<QuickEditBorder['area']>;
};

/** Source geometry and stroke appearance share the selected effect's draft owner. */
export function BorderAppearanceFields(props: {
  value: QuickEditBorder;
  onChange(patch: BorderAppearancePatch): void;
  Details: ComponentType<InspectorDisclosureProps>;
  preferenceId: string;
  onPreview?: ((patch: BorderAppearancePatch | null) => void) | undefined;
}) {
  const { value, onChange, Details } = props;
  return (
    <div className="sniptale-parameter-stack">
      <ColorField
        label={translate('gallery.videoReview.borderColor')}
        title={translate('gallery.videoReview.borderColor')}
        value={value.color}
        onChange={(color) => {
          const normalized = normalizePaintColor(color);
          if (normalized) onChange({ color: normalized });
        }}
        onPreviewChange={(color) => {
          const normalized = normalizePaintColor(color);
          if (normalized) props.onPreview?.({ color: normalized });
        }}
        onPreviewReset={() => props.onPreview?.(null)}
      />
      <PreviewNumericRow
        label={translate('gallery.videoReview.borderWidth')}
        min={1}
        max={24}
        step={1}
        precision={1}
        unit="px"
        value={value.width}
        onPreview={(width) => props.onPreview?.(width === null ? null : { width })}
        onChange={(width) => onChange({ width })}
      />
      <SegmentedRow
        columns={3}
        layout="stacked"
        ariaLabel={translate('gallery.videoReview.borderStyle')}
        label={translate('gallery.videoReview.borderStyle')}
        value={value.style}
        options={(['solid', 'dashed', 'dotted'] as const).map((style) => ({
          value: style,
          label: translate(`gallery.videoReview.borderStyle_${style}`),
        }))}
        onChange={(style: QuickEditBorder['style']) =>
          onChange({
            style,
            loop:
              value.loop &&
              (style !== 'solid' || value.motion === 'pulse' || value.motion === 'ripple'),
          })
        }
      />
      {value.reveal !== 'fade' ||
      value.exitReveal !== 'fade' ||
      (value.loop &&
        value.style !== 'solid' &&
        value.segmentPercent < 100 &&
        (value.motion === 'clockwise' || value.motion === 'counterclockwise')) ? (
        <SelectField
          label={translate('gallery.videoReview.borderOrigin')}
          value={value.origin ?? 'top-center'}
          options={(
            ['top-center', 'top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
          ).map((origin) => ({
            value: origin,
            label: translate(`gallery.videoReview.borderOrigin_${origin}`),
          }))}
          onChange={(origin) => onChange({ origin })}
        />
      ) : null}
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

/** Hold uses the persisted period as its single clock; the inspector exposes a speed multiplier. */
export function BorderHoldFields(props: {
  border: QuickEditBorder;
  onChange(patch: BorderAppearancePatch): void;
  onPreview?: ((patch: BorderAppearancePatch | null) => void) | undefined;
}) {
  const { border, onChange } = props;
  const mode = borderHoldMode(border);
  const rotating = mode === 'rotate';
  const moving = mode !== 'still';
  return (
    <>
      <SegmentedRow<'still' | 'rotate' | 'pulse' | 'ripple'>
        columns={border.style === 'solid' ? 3 : 4}
        layout="stacked"
        ariaLabel={translate('gallery.videoReview.focusReveal')}
        label={translate('gallery.videoReview.focusReveal')}
        value={mode}
        options={[
          { value: 'still', label: translate('gallery.videoReview.borderStill') },
          ...(border.style === 'solid'
            ? []
            : [
                {
                  value: 'rotate' as const,
                  label: translate('gallery.videoReview.borderRotation'),
                },
              ]),
          { value: 'pulse', label: translate('gallery.videoReview.borderPulse') },
          { value: 'ripple', label: translate('gallery.videoReview.borderRipple') },
        ]}
        onChange={(value) =>
          onChange({ loop: value !== 'still', motion: borderHoldMotion(value, border.motion) })
        }
      />
      {moving && rotating ? (
        <BorderDirectionField
          counterclockwise={border.motion === 'counterclockwise'}
          onChange={(counterclockwise) =>
            onChange({
              motion: counterclockwise ? 'counterclockwise' : 'clockwise',
            })
          }
        />
      ) : null}
      {moving ? (
        <>
          {rotating ? (
            <PreviewNumericRow
              label={translate('gallery.videoReview.borderSegmentPercent')}
              min={1}
              max={100}
              step={1}
              precision={0}
              unit="%"
              value={border.segmentPercent}
              onPreview={(segmentPercent) =>
                props.onPreview?.(segmentPercent === null ? null : { segmentPercent })
              }
              onChange={(segmentPercent) => onChange({ segmentPercent })}
            />
          ) : null}
          <PreviewNumericRow
            label={translate('gallery.videoReview.borderSpeed')}
            title={translate(
              border.motion === 'ripple'
                ? 'gallery.videoReview.borderRippleSpeedHint'
                : border.motion === 'pulse'
                  ? 'gallery.videoReview.borderPulseSpeedHint'
                  : 'gallery.videoReview.borderRotationSpeedHint'
            )}
            min={0.1}
            max={4}
            step={0.1}
            precision={1}
            unit="x"
            value={2 / border.period}
            onPreview={(speed) => props.onPreview?.(speed === null ? null : { period: 2 / speed })}
            onChange={(speed) => onChange({ period: 2 / speed })}
          />
        </>
      ) : null}
    </>
  );
}

export function BorderDirectionField(props: {
  counterclockwise: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <SegmentedRow
      columns={2}
      layout="inline"
      ariaLabel={translate('gallery.videoReview.borderDirection')}
      label={translate('gallery.videoReview.borderDirection')}
      value={props.counterclockwise ? 'counterclockwise' : 'clockwise'}
      options={[
        {
          value: 'clockwise',
          label: translate('gallery.videoReview.borderClockwise'),
          icon: <RotateCw size={16} aria-hidden="true" />,
        },
        {
          value: 'counterclockwise',
          label: translate('gallery.videoReview.borderCounterclockwise'),
          icon: <RotateCcw size={16} aria-hidden="true" />,
        },
      ]}
      onChange={(value) => props.onChange(value === 'counterclockwise')}
    />
  );
}

type BorderHoldMode = 'still' | 'rotate' | 'pulse' | 'ripple';

function borderHoldMode(border: QuickEditBorder): BorderHoldMode {
  if (!border.loop) return 'still';
  if (border.motion === 'pulse' || border.motion === 'ripple') return border.motion;
  return border.style === 'solid' ? 'still' : 'rotate';
}

function borderHoldMotion(
  mode: BorderHoldMode,
  previous: QuickEditBorder['motion']
): QuickEditBorder['motion'] {
  if (mode === 'still') return previous;
  if (mode === 'rotate') return previous === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
  return mode;
}

type BorderReveal = QuickEditBorder['reveal'] | QuickEditBorder['exitReveal'];

/** Reveal controls share appearance only; each editor owns phase clocks and commit policy. */
export function BorderRevealFields(props: {
  phase: 'enter' | 'exit';
  value: BorderReveal;
  enabled: boolean;
  onChange(value: BorderReveal | 'none'): void;
}) {
  const enter = props.phase === 'enter';
  const directional = (counterclockwise: boolean) => {
    const values = enter ? (['draw', 'draw-ccw'] as const) : (['erase', 'erase-ccw'] as const);
    return values[counterclockwise ? 1 : 0];
  };
  return (
    <>
      <SegmentedRow<'none' | 'fade' | 'draw' | 'both'>
        columns={4}
        layout="stacked"
        label={translate('gallery.videoReview.focusReveal')}
        ariaLabel={translate('gallery.videoReview.focusReveal')}
        value={
          props.enabled
            ? props.value === 'fade'
              ? 'fade'
              : props.value.endsWith('-both')
                ? 'both'
                : 'draw'
            : 'none'
        }
        options={[
          {
            value: 'none',
            label: translate(
              enter ? 'gallery.videoReview.borderAppear' : 'gallery.videoReview.borderDisappear'
            ),
          },
          { value: 'fade', label: translate('gallery.videoReview.focusFade') },
          {
            value: 'draw',
            label: translate(
              enter ? 'gallery.videoReview.borderDrawing' : 'gallery.videoReview.borderErasing'
            ),
          },
          { value: 'both', label: translate('gallery.videoReview.borderBothSides') },
        ]}
        onChange={(value) =>
          props.onChange(
            value === 'both'
              ? enter
                ? 'draw-both'
                : 'erase-both'
              : value === 'draw'
                ? directional(props.value.endsWith('-ccw'))
                : value
          )
        }
      />
      {props.enabled && props.value !== 'fade' && !props.value.endsWith('-both') ? (
        <BorderDirectionField
          counterclockwise={props.value.endsWith('-ccw')}
          onChange={(counterclockwise) => props.onChange(directional(counterclockwise))}
        />
      ) : null}
    </>
  );
}
