import { ColorField, SelectField } from '../../ui/compact-inspector-controls';
import { reviewSelectFieldClassName } from './controls';
import { ReviewNumberRow } from './number-row';
import { useState } from 'react';
import { BackgroundImagePicker } from '../../composition/background-resources/picker';
import { BackgroundThumbnails } from '../../ui/background-thumbnails';
import { translate } from '../../platform/i18n';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
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
  onImportImage?: ((file: File, originMediaId?: string) => void) | undefined;
  background: QuickEditBackgroundSettings;
  onChange(patch: QuickEditBackgroundPatch): void;
}) {
  const [imageRequested, setImageRequested] = useState(false);
  const { presets } = useGradientPresetCatalog('highlighter-frame-fill');
  const { background, onChange } = props;
  const paint = backgroundPaint(background);

  return (
    <div data-ui="gallery.videoReview.backgroundInspector" className="review-inspector-columns">
      <div className="min-w-0 space-y-2">
        <div
          className="grid grid-cols-2 gap-1"
          role="group"
          data-inspector-choices
          aria-label={translate('gallery.videoReview.background')}
        >
          {kinds.map((kind) => (
            <ReviewButton
              key={kind.key}
              label={translate(kind.label)}
              aria-pressed={
                !imageRequested &&
                (kind.key === 'none'
                  ? !background.enabled
                  : background.enabled && background.type === kind.key)
              }
              className={reviewTextButtonClassName}
              onClick={() => {
                setImageRequested(false);
                onChange(
                  kind.key === 'none'
                    ? { enabled: false }
                    : {
                        enabled: true,
                        type: kind.key,
                        ...(kind.key === 'solid' ? { color: '#000000ff' } : {}),
                      }
                );
              }}
            >
              {translate(kind.label)}
            </ReviewButton>
          ))}
          <ReviewButton
            label={translate('gallery.videoReview.backgroundImage')}
            className={reviewTextButtonClassName}
            aria-pressed={imageRequested || (background.enabled && background.type === 'image')}
            onClick={() => setImageRequested(true)}
          />
        </div>
        {imageRequested || (background.enabled && background.type === 'image') ? (
          <BackgroundImagePicker
            onSelect={({ file, originMediaId }) => props.onImportImage?.(file, originMediaId)}
          />
        ) : background.enabled && background.type === 'gradient' ? (
          <BackgroundThumbnails
            label={translate('videoEditor.sidebar.sceneBackgroundPresetLabel')}
            dataUi="gallery.videoReview.gradientPresets"
            items={presets
              .filter((preset) => preset.enabled)
              .sort((a, b) => a.order - b.order)
              .map((preset) => ({
                id: preset.id,
                name: preset.name,
                active:
                  serializePaintToCss(paint) ===
                  serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
                style: {
                  background: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
                },
              }))}
            onSelect={(id) => {
              const preset = presets.find((item) => item.id === id);
              if (preset) onChange({ enabled: true, type: 'gradient', gradient: preset.gradient });
            }}
          />
        ) : null}
        {!imageRequested && background.enabled && background.type !== 'image' ? (
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
      </div>
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
  const changeShadowColor = (color: string) =>
    onChange({
      layout: {
        ...background.layout,
        shadow: { intensity: background.layout.shadow?.intensity ?? 0, color },
      },
    });
  const layoutField = (key: 'padding' | 'cornerRadius', label: string) => (
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
      <ReviewNumberRow
        label={translate('gallery.videoReview.backgroundShadow')}
        unit="%"
        min={0}
        max={100}
        step={1}
        value={background.layout.shadow?.intensity ?? 0}
        onChange={(intensity) =>
          onChange({
            layout: {
              ...background.layout,
              shadow: { color: background.layout.shadow?.color ?? '#475569ff', intensity },
            },
          })
        }
      />
      <ColorField
        label={translate('gallery.videoReview.backgroundShadowColor')}
        title={translate('gallery.videoReview.backgroundShadowColor')}
        value={background.layout.shadow?.color ?? '#475569ff'}
        onChange={changeShadowColor}
        onPreviewChange={changeShadowColor}
        onPreviewReset={changeShadowColor}
      />
    </div>
  );
}
