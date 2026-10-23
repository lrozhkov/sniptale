import type { ComponentType } from 'react';
import type { InspectorDisclosureProps } from '../compact-inspector-controls/shared';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Strikethrough } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ColorField,
  TextareaField,
  SegmentedRow,
  ToggleField,
} from '../compact-inspector-controls';
import {
  parseQuickEditWatermark,
  type QuickEditWatermarkSettings,
} from '../../features/video/project/scene/watermark';
import { translate } from '../../platform/i18n';
import { PreviewNumericRow as ReviewPreviewNumberRow } from '../compact-inspector-controls/numeric-preview';

export type WatermarkBinding = {
  Disclosure: ComponentType<InspectorDisclosureProps>;
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
      <TextareaField
        value={draft}
        label={translate('gallery.videoReview.watermarkText')}
        aria-label={translate('gallery.videoReview.watermarkText')}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : errorId}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(value) => {
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
      <SegmentedRow
        columns={3}
        ariaLabel={translate('gallery.videoReview.watermarkFont')}
        value={text.font}
        options={[
          { value: 'sans', label: translate('gallery.videoReview.watermarkFontSans') },
          { value: 'serif', label: translate('gallery.videoReview.watermarkFontSerif') },
          { value: 'mono', label: translate('gallery.videoReview.watermarkFontMono') },
        ]}
        onChange={(font: typeof text.font) => onChange(patch({ font }))}
      />
      <WatermarkNumber
        {...props}
        label={translate('gallery.videoReview.watermarkSize')}
        unit="px"
        value={text.size * shortSide}
        min={Math.ceil(shortSide / 1080)}
        max={Math.max(1, Math.floor(shortSide * 0.25))}
        step={1}
        precision={0}
        change={(value) =>
          patch({ size: Math.max(1 / 1080, Math.min(0.25, Math.round(value) / shortSide)) })
        }
      />
      <ColorField
        className="w-full min-w-0"
        label={translate('gallery.videoReview.watermarkColor')}
        title={translate('gallery.videoReview.watermarkColor')}
        value={text.color}
        onChange={(color) => onChange(patch({ color }))}
        onPreviewChange={(color) => onPreview(patch({ color }))}
        onPreviewReset={() => onPreview(null)}
      />
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label={translate('gallery.videoReview.watermarkWeight')}
          className="flex gap-1"
        >
          <ContentToolbarButton
            tone="utility"
            aria-label={translate('gallery.videoReview.watermarkBold')}
            title={translate('gallery.videoReview.watermarkBold')}
            aria-pressed={text.weight === 'bold'}
            className="!border-0 !bg-transparent"
            onClick={() => onChange(patch({ weight: text.weight === 'bold' ? 'normal' : 'bold' }))}
          >
            <Bold
              size={15}
              aria-hidden="true"
              style={{ color: text.weight === 'bold' ? 'var(--sniptale-color-accent)' : undefined }}
            />
          </ContentToolbarButton>
          <ContentToolbarButton
            tone="utility"
            aria-label={translate('gallery.videoReview.watermarkItalic')}
            title={translate('gallery.videoReview.watermarkItalic')}
            aria-pressed={text.italic === true}
            className="!border-0 !bg-transparent"
            onClick={() => onChange(patch({ italic: !text.italic }))}
          >
            <Italic
              size={15}
              aria-hidden="true"
              style={{ color: text.italic ? 'var(--sniptale-color-accent)' : undefined }}
            />
          </ContentToolbarButton>
          <ContentToolbarButton
            tone="utility"
            aria-label={translate('gallery.videoReview.watermarkStrike')}
            title={translate('gallery.videoReview.watermarkStrike')}
            aria-pressed={text.strike === true}
            className="!border-0 !bg-transparent"
            onClick={() => onChange(patch({ strike: !text.strike }))}
          >
            <Strikethrough
              size={15}
              aria-hidden="true"
              style={{ color: text.strike ? 'var(--sniptale-color-accent)' : undefined }}
            />
          </ContentToolbarButton>
        </div>
        <div className="min-w-0 flex-1">
          <SegmentedRow
            columns={3}
            ariaLabel={translate('gallery.videoReview.watermarkAlign')}
            value={text.align}
            options={[
              {
                value: 'left',
                label: translate('gallery.videoReview.watermarkAlignLeft'),
                icon: <AlignLeft size={15} />,
              },
              {
                value: 'center',
                label: translate('gallery.videoReview.watermarkAlignCenter'),
                icon: <AlignCenter size={15} />,
              },
              {
                value: 'right',
                label: translate('gallery.videoReview.watermarkAlignRight'),
                icon: <AlignRight size={15} />,
              },
            ]}
            onChange={(align: typeof text.align) => onChange(patch({ align }))}
          />
        </div>
      </div>
      <props.Disclosure
        label={translate('gallery.videoReview.watermarkAdvanced')}
        preferenceId="watermark.text.advanced"
      >
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
        <ToggleField
          value={text.shadow}
          label={translate('gallery.videoReview.watermarkShadow')}
          onChange={(shadow) => onChange(patch({ shadow }))}
        />
      </props.Disclosure>
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
    precision?: number;
    change(value: number): QuickEditWatermarkSettings;
  }
) {
  return (
    <ReviewPreviewNumberRow
      enterBehavior="blur"
      label={props.label}
      {...(props.unit ? { unit: props.unit } : {})}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      precision={props.precision ?? 1}
      onPreview={(value) => props.onPreview(value === null ? null : props.change(value))}
      onChange={(value) => props.onChange(props.change(value))}
    />
  );
}
