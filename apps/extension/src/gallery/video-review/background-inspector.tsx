import { SelectField } from '../../ui/compact-inspector-controls';
import { reviewSelectFieldClassName } from './controls';
import { ReviewNumberRow } from './number-row';
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
import { ReviewButton, reviewTextButtonClassName } from './controls';

const kinds = [
  { key: 'none', label: 'gallery.videoReview.backgroundNone' },
  { key: 'solid', label: 'gallery.videoReview.backgroundSolid' },
  { key: 'gradient', label: 'gallery.videoReview.backgroundGradient' },
] as const;

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

  return (
    <div data-ui="gallery.videoReview.backgroundInspector" className="min-w-0 space-y-2">
      <div
        className="grid grid-cols-2 gap-1"
        role="group"
        data-inspector-choices
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
            className={reviewTextButtonClassName}
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
          className={reviewTextButtonClassName}
          aria-pressed={background.enabled && background.type === 'image'}
          onClick={() => fileInput.current?.click()}
        />
      </div>
      {background.enabled && background.type === 'gradient' ? (
        <div
          className="grid grid-cols-5 gap-2"
          role="group"
          aria-label={translate('videoEditor.sidebar.sceneBackgroundPresetLabel')}
          data-ui="gallery.videoReview.gradientPresets"
        >
          {presets
            .filter((preset) => preset.enabled)
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order)
            .slice(0, 10)
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
                    transition-opacity hover:opacity-80
                    aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-2
                    aria-pressed:outline-[var(--sniptale-color-accent)]
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]"
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
          triggerVariant="swatch"
          className="relative w-full min-w-0 [&>button>span>span]:text-xs
            [&>button>span>span]:font-semibold"
          label={translate('gallery.videoReview.background')}
          title={translate('gallery.videoReview.background')}
          value={paint}
          palette={[
            '#18181b',
            '#fafafa',
            '#334155',
            '#2563eb',
            '#0f766e',
            '#14b8a6',
            '#f97316',
            '#e11d48',
          ]}
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
        <ReviewBackgroundLayoutControls background={background} onChange={onChange} />
      ) : null}
    </div>
  );
}

/** Frame geometry and camera participation, independent of the selected paint kind. */
function ReviewBackgroundLayoutControls({
  background,
  onChange,
}: {
  background: Extract<QuickEditBackgroundSettings, { enabled: true }>;
  onChange(patch: QuickEditBackgroundPatch): void;
}) {
  const layoutField = (key: keyof QuickEditBackgroundLayout, label: string) => (
    <ReviewNumberRow
      label={label}
      unit="px"
      min={0}
      max={4096}
      scrubMax={key === 'padding' ? 200 : 100}
      step={1}
      value={background.layout[key]}
      onChange={(value) => onChange({ layout: { ...background.layout, [key]: value } })}
    />
  );
  return (
    <div className="space-y-2">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.backgroundZoom')}
        value={background.zoomBehavior ?? 'fixed'}
        options={[
          { value: 'fixed', label: translate('gallery.videoReview.backgroundZoomFixed') },
          {
            value: 'follow-video',
            label: translate('gallery.videoReview.backgroundZoomFollow'),
          },
        ]}
        onChange={(zoomBehavior) => {
          if (zoomBehavior === 'fixed' || zoomBehavior === 'follow-video')
            onChange({ zoomBehavior });
        }}
      />
      {layoutField('padding', translate('gallery.videoReview.backgroundPadding'))}
      {layoutField('cornerRadius', translate('gallery.videoReview.backgroundCornerRadius'))}
    </div>
  );
}
