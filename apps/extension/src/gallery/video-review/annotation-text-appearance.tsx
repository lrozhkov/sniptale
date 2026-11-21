import {
  REVIEW_TEXT_FONT_FAMILIES,
  legacyReviewTextAppearance,
  reviewTextTypefaces,
  type ReviewTextAppearance,
} from '../../features/video/review/annotation-effects/text-appearance';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';
import { translate } from '../../platform/i18n';
import {
  ColorField,
  NumericRow,
  SelectField,
  ToggleField,
} from '../../ui/compact-inspector-controls';
import { ReviewDetails, reviewSelectFieldClassName } from './controls';

type Props = {
  clip: ReviewAnnotationTextClip;
  disabled: boolean;
  change(edit: (clip: ReviewAnnotationTextClip) => ReviewAnnotationTextClip): void;
};

function TextNumber(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange(value: number): void;
}) {
  const { onChange, step = 1, ...field } = props;
  return (
    <NumericRow
      {...field}
      appearance="plain"
      unit="%"
      step={step}
      precision={1}
      onPreviewValue={() => undefined}
      onCommitValue={onChange}
    />
  );
}

function TextColor(props: {
  label: string;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  return (
    <ColorField
      {...props}
      title={props.label}
      allowAlpha={false}
      allowTransparent={false}
      onChange={(value) => props.onChange(value.slice(0, 7))}
    />
  );
}

/** Uses the same versioned appearance model as the video frame renderer. */
export function ReviewAnnotationTextAppearance({ clip, disabled, change }: Props) {
  const style = clip.appearance ?? legacyReviewTextAppearance;
  const { minWeight, maxWeight } = reviewTextTypefaces[style.family];
  const update = (edit: (appearance: ReviewTextAppearance) => ReviewTextAppearance) =>
    change((item) => ({
      ...item,
      appearance: edit(item.appearance ?? legacyReviewTextAppearance),
    }));
  const patch = (values: Partial<ReviewTextAppearance>) =>
    update((appearance) => ({ ...appearance, ...values }));
  const background = (values: Partial<ReviewTextAppearance['background']>) =>
    update((appearance) => ({
      ...appearance,
      background: { ...appearance.background, ...values },
    }));
  const outline = (values: Partial<ReviewTextAppearance['outline']>) =>
    update((appearance) => ({ ...appearance, outline: { ...appearance.outline, ...values } }));
  const shadow = (values: Partial<ReviewTextAppearance['shadow']>) =>
    update((appearance) => ({ ...appearance, shadow: { ...appearance.shadow, ...values } }));
  const label = (key: Parameters<typeof translate>[0]) => translate(key);
  const number = (
    key: Parameters<typeof translate>[0],
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
    step?: number
  ) => (
    <TextNumber
      label={label(key)}
      value={value * 100}
      min={min}
      max={max}
      disabled={disabled}
      {...(step === undefined ? {} : { step })}
      onChange={(value) => onChange(value / 100)}
    />
  );
  return (
    <>
      <ToggleField
        label={label('gallery.videoReview.annotationEnabled')}
        value={clip.enabled}
        disabled={disabled}
        onChange={(enabled) => change((item) => ({ ...item, enabled }))}
      />
      <ReviewDetails
        label={label('gallery.videoReview.annotationTextFont')}
        preferenceId="text-font"
        initiallyOpen
      >
        <SelectField
          className={reviewSelectFieldClassName}
          label={label('gallery.videoReview.annotationTextFamily')}
          disabled={disabled}
          value={style.family}
          options={REVIEW_TEXT_FONT_FAMILIES.map((value) => ({
            value,
            label: translate(`gallery.videoReview.annotationTextTypeface_${value}`),
          }))}
          onChange={(family) => {
            const { minWeight, maxWeight } = reviewTextTypefaces[family];
            update((current) => ({
              ...current,
              family,
              weight: Math.min(maxWeight, Math.max(minWeight, current.weight)),
            }));
          }}
        />
        <SelectField
          className={reviewSelectFieldClassName}
          label={label('gallery.videoReview.annotationTextWeight')}
          disabled={disabled}
          value={String(style.weight)}
          options={Array.from(
            new Set([
              ...Array.from(
                { length: (maxWeight - minWeight) / 100 + 1 },
                (_, index) => minWeight + index * 100
              ),
              style.weight,
            ])
          )
            .sort((a, b) => a - b)
            .map((weight) => ({ value: String(weight), label: String(weight) }))}
          onChange={(value) => patch({ weight: Number(value) })}
        />
        {number(
          'gallery.videoReview.annotationTextFontSize',
          clip.fontSize,
          0.5,
          50,
          (fontSize) => change((item) => ({ ...item, fontSize })),
          0.5
        )}
        <TextColor
          label={label('gallery.videoReview.annotationTextColor')}
          value={clip.color}
          disabled={disabled}
          onChange={(color) => change((item) => ({ ...item, color }))}
        />
        <SelectField
          className={reviewSelectFieldClassName}
          label={label('gallery.videoReview.annotationTextAlign')}
          disabled={disabled}
          value={style.align}
          options={[
            { value: 'left', label: label('gallery.videoReview.annotationTextAlignLeft') },
            { value: 'center', label: label('gallery.videoReview.annotationTextAlignCenter') },
            { value: 'right', label: label('gallery.videoReview.annotationTextAlignRight') },
          ]}
          onChange={(align) => patch({ align })}
        />
        {number(
          'gallery.videoReview.annotationTextLineHeight',
          style.lineHeight,
          80,
          300,
          (lineHeight) => patch({ lineHeight })
        )}
        {number(
          'gallery.videoReview.annotationTextLetterSpacing',
          style.letterSpacing,
          -5,
          35,
          (letterSpacing) => patch({ letterSpacing })
        )}
      </ReviewDetails>
      <ReviewDetails
        label={label('gallery.videoReview.annotationTextBackground')}
        preferenceId="text-background"
        initiallyOpen
      >
        <SelectField
          className={reviewSelectFieldClassName}
          label={label('gallery.videoReview.annotationTextBackgroundMode')}
          disabled={disabled}
          value={style.background.mode}
          options={[
            { value: 'none', label: label('gallery.videoReview.annotationTextBackgroundNone') },
            { value: 'block', label: label('gallery.videoReview.annotationTextTemplate_block') },
            { value: 'marker', label: label('gallery.videoReview.annotationTextTemplate_marker') },
          ]}
          onChange={(mode) => background({ mode })}
        />
        {style.background.mode !== 'none' && (
          <>
            <TextColor
              label={label('gallery.videoReview.annotationTextBackgroundColor')}
              value={style.background.color}
              disabled={disabled}
              onChange={(color) => background({ color })}
            />
            {number(
              'gallery.videoReview.annotationTextOpacity',
              style.background.opacity,
              0,
              100,
              (opacity) => background({ opacity })
            )}
            {number(
              'gallery.videoReview.annotationTextPaddingX',
              style.background.paddingX,
              0,
              200,
              (paddingX) => background({ paddingX })
            )}
            {number(
              'gallery.videoReview.annotationTextPaddingY',
              style.background.paddingY,
              0,
              200,
              (paddingY) => background({ paddingY })
            )}
            {style.background.mode === 'block' &&
              number(
                'gallery.videoReview.annotationTextRadius',
                style.background.radius,
                0,
                200,
                (radius) => background({ radius })
              )}
          </>
        )}
      </ReviewDetails>
      <ReviewDetails
        label={label('gallery.videoReview.annotationTextEffects')}
        preferenceId="text-effects"
        initiallyOpen
      >
        <ToggleField
          label={label('gallery.videoReview.annotationTextOutline')}
          value={style.outline.enabled}
          disabled={disabled}
          onChange={(enabled) => outline({ enabled })}
        />
        {style.outline.enabled && (
          <>
            {number(
              'gallery.videoReview.annotationTextOutlineWidth',
              style.outline.width,
              0,
              25,
              (width) => outline({ width })
            )}
            <TextColor
              label={label('gallery.videoReview.annotationTextOutlineColor')}
              value={style.outline.color}
              disabled={disabled}
              onChange={(color) => outline({ color })}
            />
            {number(
              'gallery.videoReview.annotationTextOutlineOpacity',
              style.outline.opacity,
              0,
              100,
              (opacity) => outline({ opacity })
            )}
          </>
        )}
        <ToggleField
          label={label('gallery.videoReview.annotationTextShadow')}
          value={style.shadow.enabled}
          disabled={disabled}
          onChange={(enabled) => shadow({ enabled })}
        />
        {style.shadow.enabled && (
          <>
            {number(
              'gallery.videoReview.annotationTextShadowOpacity',
              style.shadow.opacity,
              0,
              100,
              (opacity) => shadow({ opacity })
            )}
            <ReviewDetails
              label={label('gallery.videoReview.annotationTextShadowDetails')}
              preferenceId="text-shadow-details"
            >
              <TextColor
                label={label('gallery.videoReview.annotationTextShadowColor')}
                value={style.shadow.color}
                disabled={disabled}
                onChange={(color) => shadow({ color })}
              />
              {number(
                'gallery.videoReview.annotationTextShadowBlur',
                style.shadow.blur,
                0,
                100,
                (blur) => shadow({ blur })
              )}
              {number('gallery.videoReview.annotationTextShadowX', style.shadow.x, -100, 100, (x) =>
                shadow({ x })
              )}
              {number('gallery.videoReview.annotationTextShadowY', style.shadow.y, -100, 100, (y) =>
                shadow({ y })
              )}
            </ReviewDetails>
          </>
        )}
      </ReviewDetails>
    </>
  );
}
