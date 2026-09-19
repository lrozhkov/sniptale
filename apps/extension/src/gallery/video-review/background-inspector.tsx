import { useRef } from 'react';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundLayout,
  QuickEditBackgroundSettings,
} from '../../features/video/review/advanced/types';
import type { QuickEditBackgroundPatch } from '../../features/video/review/advanced/background';
import { serializePaintToCss, createSolidPaint, type Paint } from '@sniptale/foundation/paint';
import { useGradientPresetCatalog } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { CompactPaintSelector } from '../../ui/paint-selector';
import { ReviewButton } from './controls';

const fieldClass =
  'w-full rounded-[var(--sniptale-radius-sm)] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-canvas)] px-2 py-1 text-sm outline-none ' +
  'focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]';
const number = (value: string) => (value === '' ? undefined : Number(value));

const kinds = [
  { key: 'none', label: 'gallery.videoReview.backgroundNone' },
  { key: 'solid', label: 'gallery.videoReview.backgroundSolid' },
  { key: 'gradient', label: 'gallery.videoReview.backgroundGradient' },
] as const;

function backgroundLayout(background: QuickEditBackgroundSettings): QuickEditBackgroundLayout {
  return background.enabled ? background.layout : { padding: 0, cornerRadius: 0 };
}

function backgroundPaint(background: QuickEditBackgroundSettings): Paint {
  if (!background.enabled) return createSolidPaint('#000000ff');
  if (background.type === 'solid') return createSolidPaint(background.color);
  if (background.type === 'gradient') return { kind: 'gradient', gradient: background.gradient };
  return createSolidPaint('#000000ff');
}

/** Canvas background owner: kind, paint, and layout belong to the whole frame. */
export function ReviewBackgroundInspector(props: {
  onImportImage?: ((file: File) => void) | undefined;
  background: QuickEditBackgroundSettings;
  onChange(patch: QuickEditBackgroundPatch): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { presets } = useGradientPresetCatalog('highlighter-frame-fill');
  const { background, onChange } = props;
  const paint = backgroundPaint(background);
  const layoutField = (key: keyof QuickEditBackgroundLayout, label: string) => (
    <label className="space-y-1">
      <span className="block text-xs text-[var(--sniptale-color-text-muted)]">{label}</span>
      <input
        aria-label={label}
        className={`${fieldClass} tabular-nums`}
        type="number"
        min={0}
        max={4096}
        step={2}
        value={background.enabled ? background.layout[key] : 0}
        onChange={(event) => {
          const value = number(event.target.value);
          if (value !== undefined) {
            onChange({ layout: { ...backgroundLayout(background), [key]: value } });
          }
        }}
      />
    </label>
  );
  return (
    <div
      data-ui="gallery.videoReview.backgroundInspector"
      className="space-y-3 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
    >
      <h4 className="text-sm font-semibold">{translate('gallery.videoReview.canvas')}</h4>
      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--sniptale-color-surface-canvas)] p-1"
        role="group"
        aria-label={translate('gallery.videoReview.background')}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) props.onImportImage?.(file);
          }}
        />
        {kinds.map((kind) => (
          <ReviewButton
            key={kind.key}
            label={translate(kind.label)}
            aria-pressed={
              kind.key === 'none'
                ? !background.enabled
                : background.enabled && background.type === kind.key
            }
            className="!text-xs aria-pressed:!bg-[var(--sniptale-color-accent-soft)]
              aria-pressed:!text-[var(--sniptale-color-accent-emphasis)]"
            onClick={() =>
              onChange(
                kind.key === 'none'
                  ? { enabled: false }
                  : {
                      enabled: true,
                      type: kind.key,
                      ...(kind.key === 'solid' ? { color: '#000000ff' } : {}),
                    }
              )
            }
          >
            {translate(kind.label)}
          </ReviewButton>
        ))}
        <ReviewButton
          label={translate('gallery.videoReview.backgroundImage')}
          className="!text-xs aria-pressed:!bg-[var(--sniptale-color-accent-soft)]
            aria-pressed:!text-[var(--sniptale-color-accent-emphasis)]"
          aria-pressed={background.enabled && background.type === 'image'}
          onClick={() => fileInput.current?.click()}
        />
      </div>
      {background.enabled && background.type === 'gradient' ? (
        <div className="grid grid-cols-5 gap-2" role="group">
          {presets
            .filter((preset) => preset.enabled)
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order)
            .slice(0, 5)
            .map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                aria-label={preset.name}
                aria-pressed={
                  serializePaintToCss(paint) ===
                  serializePaintToCss({ kind: 'gradient', gradient: preset.gradient })
                }
                className="h-8 min-w-0 rounded border border-[var(--sniptale-color-border-subtle)]
                    transition-opacity hover:opacity-80"
                style={{
                  background: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
                }}
                onClick={() =>
                  onChange({ enabled: true, type: 'gradient', gradient: preset.gradient })
                }
              />
            ))}
        </div>
      ) : null}
      {background.enabled && background.type !== 'image' ? (
        <CompactPaintSelector
          label={translate('gallery.videoReview.background')}
          title={translate('gallery.videoReview.background')}
          value={paint}
          recentColors={[]}
          onChange={(next: Paint) =>
            onChange(
              next.kind === 'solid'
                ? { enabled: true, type: 'solid', color: next.color }
                : { enabled: true, type: 'gradient', gradient: next.gradient }
            )
          }
        />
      ) : null}
      {background.enabled ? (
        <div className="grid grid-cols-2 gap-2">
          {layoutField('padding', translate('gallery.videoReview.backgroundPadding'))}
          {layoutField('cornerRadius', translate('gallery.videoReview.backgroundCornerRadius'))}
        </div>
      ) : null}
    </div>
  );
}
