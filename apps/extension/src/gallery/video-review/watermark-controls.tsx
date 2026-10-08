import { useEffect, useId, useRef, useState } from 'react';
import { ColorField, CompactTextarea, SelectField } from '../../ui/compact-inspector-controls';
import {
  parseQuickEditWatermark,
  type QuickEditWatermarkSettings,
} from '../../features/video/review/advanced/watermark';
import { translate } from '../../platform/i18n';
import { reviewSelectFieldClassName } from './controls';
import { ReviewPreviewNumberRow } from './number-row';

export type WatermarkBinding = {
  settings: QuickEditWatermarkSettings;
  onChange(settings: QuickEditWatermarkSettings): Promise<boolean>;
  onPreview(settings: QuickEditWatermarkSettings | null): void;
};
type Binding = WatermarkBinding;

function WatermarkTextDraft({ settings, onChange, onPreview }: Binding) {
  const [draft, setDraft] = useState(settings.text.value);
  const accepted = useRef(settings.text.value);
  const composing = useRef(false);
  const saving = useRef<symbol | null>(null);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const errorId = useId();
  useEffect(() => {
    setDraft(settings.text.value);
    accepted.current = settings.text.value;
    saving.current = null;
  }, [settings.text.value]);
  useEffect(
    () => () => {
      saving.current = null;
      preview.current(null);
    },
    []
  );
  const proposed = { ...settings, text: { ...settings.text, value: draft } };
  const valid = parseQuickEditWatermark(proposed) !== null;
  const commit = () => {
    if (saving.current || composing.current || !valid || draft === accepted.current) return;
    const attempt = Symbol('text-save');
    saving.current = attempt;
    onPreview(null);
    void onChange(proposed)
      .then((saved) => {
        if (saving.current !== attempt) return;
        if (saved) accepted.current = draft;
      })
      .catch(() => undefined)
      .finally(() => {
        if (saving.current === attempt) saving.current = null;
      });
  };
  return (
    <div className="space-y-1">
      <CompactTextarea
        value={draft}
        aria-label={translate('gallery.videoReview.watermarkText')}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : errorId}
        className="!min-h-20 w-full rounded-md px-2 py-2 text-xs"
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setDraft(value);
          const next = { ...settings, text: { ...settings.text, value } };
          onPreview(parseQuickEditWatermark(next) ? next : null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing || composing.current) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            saving.current = null;
            accepted.current = settings.text.value;
            setDraft(settings.text.value);
            onPreview(null);
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commit();
          }
        }}
      />
      {!valid && (
        <p id={errorId} role="alert" className="text-xs">
          {translate('gallery.videoReview.watermarkTextInvalid')}
        </p>
      )}
    </div>
  );
}

export function WatermarkTextFields(
  props: Binding & { output: { width: number; height: number } }
) {
  const { settings, onChange, onPreview } = props;
  const text = settings.text;
  const patch = (value: Partial<QuickEditWatermarkSettings['text']>) => ({
    ...settings,
    text: { ...text, ...value },
  });
  const shortSide = Math.min(props.output.width, props.output.height);
  return (
    <>
      <WatermarkTextDraft {...props} />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.watermarkFont')}
        value={text.font}
        options={[
          { value: 'sans', label: translate('gallery.videoReview.watermarkFontSans') },
          { value: 'serif', label: translate('gallery.videoReview.watermarkFontSerif') },
          { value: 'mono', label: translate('gallery.videoReview.watermarkFontMono') },
        ]}
        onChange={(font: typeof text.font) => onChange(patch({ font }))}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.watermarkWeight')}
        value={text.weight}
        options={[
          { value: 'normal', label: translate('gallery.videoReview.watermarkNormal') },
          { value: 'bold', label: translate('gallery.videoReview.watermarkBold') },
        ]}
        onChange={(weight: typeof text.weight) => onChange(patch({ weight }))}
      />
      <WatermarkNumber
        {...props}
        label={translate('gallery.videoReview.watermarkSize')}
        unit="px"
        value={text.size * shortSide}
        min={shortSide / 1080}
        max={shortSide * 0.25}
        step={1}
        change={(value) => patch({ size: value / shortSide })}
      />
      <ColorField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.watermarkColor')}
        title={translate('gallery.videoReview.watermarkColor')}
        value={text.color}
        onChange={(color) => onChange(patch({ color }))}
        onPreviewChange={(color) => onPreview(patch({ color }))}
        onPreviewReset={() => onPreview(null)}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.watermarkAlign')}
        value={text.align}
        options={[
          { value: 'left', label: translate('gallery.videoReview.watermarkAlignLeft') },
          { value: 'center', label: translate('gallery.videoReview.watermarkAlignCenter') },
          { value: 'right', label: translate('gallery.videoReview.watermarkAlignRight') },
        ]}
        onChange={(align: typeof text.align) => onChange(patch({ align }))}
      />
      <WatermarkNumber
        {...props}
        label={translate('gallery.videoReview.watermarkWrap')}
        unit="%"
        value={text.wrapWidth * 100}
        min={5}
        max={100}
        step={1}
        change={(value) => patch({ wrapWidth: value / 100 })}
      />
      <label
        className={
          'flex min-h-8 items-center justify-between gap-2 text-xs ' +
          'text-[var(--sniptale-color-text-secondary)]'
        }
      >
        {translate('gallery.videoReview.watermarkShadow')}
        <input
          type="checkbox"
          className="size-4 accent-[var(--sniptale-color-text-primary)]"
          checked={text.shadow}
          onChange={(event) => onChange(patch({ shadow: event.currentTarget.checked }))}
        />
      </label>
    </>
  );
}

/** Numeric conversion and accepted gestures share one full-settings preview/commit contract. */
export function WatermarkNumber(
  props: Binding & {
    label: string;
    unit?: '%' | 'px';
    value: number;
    min: number;
    max: number;
    step: number;
    change(value: number): QuickEditWatermarkSettings;
  }
) {
  return (
    <ReviewPreviewNumberRow
      label={props.label}
      {...(props.unit ? { unit: props.unit } : {})}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      precision={1}
      onPreview={(value) => props.onPreview(value === null ? null : props.change(value))}
      onChange={(value) => props.onChange(props.change(value))}
    />
  );
}
