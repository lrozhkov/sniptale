import './background-inspector.css';
import { ColorField, SelectField, SegmentedRow } from '../../ui/compact-inspector-controls';
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

const kinds = [
  { key: 'none', label: 'gallery.videoReview.backgroundNone' },
  { key: 'solid', label: 'gallery.videoReview.backgroundSolid' },
  { key: 'gradient', label: 'gallery.videoReview.backgroundGradient' },
  { key: 'image', label: 'gallery.videoReview.backgroundImage' },
] as const;

function backgroundPaint(background: QuickEditBackgroundSettings): Paint {
  if (!background.enabled) return createSolidPaint('#000000ff');
  if (background.type === 'solid') return createSolidPaint(background.color);
  if (background.type === 'gradient') return { kind: 'gradient', gradient: background.gradient };
  return createSolidPaint('#000000ff');
}

/** Canvas background owner: kind, paint, and layout belong to the whole frame. */
export function ReviewBackgroundInspector(props: {
  perspectiveFixed?: boolean | undefined;
  pending?: boolean;
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
        <div className="review-background-kinds">
          <SegmentedRow
            columns={4}
            ariaLabel={translate('gallery.videoReview.background')}
            options={kinds.map((kind) => ({ value: kind.key, label: translate(kind.label) }))}
            value={imageRequested ? 'image' : background.enabled ? background.type : 'none'}
            onChange={(kind) => {
              setImageRequested(kind === 'image');
              if (kind === 'image') {
                if (background.rememberedImage) onChange({ enabled: true, type: 'image' });
                return;
              }
              onChange(
                kind === 'none'
                  ? { enabled: false }
                  : {
                      enabled: true,
                      type: kind,
                      ...(kind === 'solid' ? { color: '#000000ff' } : {}),
                    }
              );
            }}
          />
        </div>
        {imageRequested || (background.enabled && background.type === 'image') ? (
          <BackgroundImagePicker
            pending={props.pending ?? false}
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
            className="review-background-paint relative w-full min-w-0"
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
        <ReviewBackgroundLayoutControls
          perspectiveFixed={props.perspectiveFixed}
          background={background}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

/** Frame geometry and camera participation, independent of the selected paint kind. */
function ReviewBackgroundLayoutControls({
  perspectiveFixed,
  background,
  onChange,
}: {
  perspectiveFixed?: boolean | undefined;
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
        disabled={perspectiveFixed}
        value={perspectiveFixed ? 'fixed' : (background.zoomBehavior ?? 'fixed')}
        options={[
          { value: 'fixed', label: translate('gallery.videoReview.backgroundZoomFixed') },
          {
            value: 'follow-video',
            label: translate('gallery.videoReview.backgroundZoomFollow'),
          },
        ]}
        onChange={(zoomBehavior) => {
          if (!perspectiveFixed && (zoomBehavior === 'fixed' || zoomBehavior === 'follow-video'))
            onChange({ zoomBehavior });
        }}
      />
      {perspectiveFixed ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.perspectiveBackground')}
        </p>
      ) : null}
      {background.type !== 'solid' ? (
        <ReviewNumberRow
          label={translate('editor.scene.backgroundBlurAmount')}
          unit="px"
          min={0}
          max={25}
          step={1}
          value={background.layout.blur ?? 0}
          onChange={(blur) => onChange({ layout: { ...background.layout, blur } })}
        />
      ) : null}
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
