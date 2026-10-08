import './background-inspector.css';
import { ColorField, SelectField, SegmentedRow } from '../../ui/compact-inspector-controls';
import { reviewSelectFieldClassName } from './controls';
import { ReviewPreviewNumberRow } from './number-row';
import { useEffect, useRef, useState } from 'react';
import { BackgroundImagePicker } from '../../composition/background-resources/picker';
import { translate } from '../../platform/i18n';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { QuickEditBackgroundPatch } from '../../features/video/review/advanced/background';
import { createSolidPaint, type Paint } from '@sniptale/foundation/paint';
import { ReviewBackgroundPaints } from './background-paints';

const kinds = [
  { key: 'none', label: 'gallery.videoReview.backgroundNone' },
  { key: 'solid', label: 'gallery.videoReview.backgroundSolid' },
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
  onPreview?(patch: QuickEditBackgroundPatch | null): void;
}) {
  const [imageRequested, setImageRequested] = useState(false);
  const { background, onChange } = props;
  const paint = backgroundPaint(background);
  const preview = useRef(props.onPreview);
  preview.current = props.onPreview;
  // Leaving the inspector cancels an unfinished scene gesture.
  useEffect(() => () => preview.current?.(null), []);

  return (
    <div data-ui="gallery.videoReview.backgroundInspector" className="review-inspector-columns">
      <div className="min-w-0 space-y-2">
        <div className="review-background-kinds">
          <SegmentedRow
            columns={3}
            ariaLabel={translate('gallery.videoReview.background')}
            options={kinds.map((kind) => ({ value: kind.key, label: translate(kind.label) }))}
            value={
              imageRequested
                ? 'image'
                : background.enabled
                  ? background.type === 'image'
                    ? 'image'
                    : 'solid'
                  : 'none'
            }
            onChange={(kind) => {
              setImageRequested(kind === 'image');
              if (kind === 'image') {
                if (background.rememberedImage) onChange({ enabled: true, type: 'image' });
                return;
              }
              if (kind === 'none') onChange({ enabled: false });
              else {
                const paint =
                  background.enabled && background.type !== 'image'
                    ? backgroundPaint(background)
                    : background.rememberedPaint;
                onChange(
                  paint?.kind === 'gradient'
                    ? { enabled: true, type: 'gradient', gradient: paint.gradient }
                    : { enabled: true, type: 'solid', color: paint?.color ?? '#000000ff' }
                );
              }
            }}
          />
        </div>
        {imageRequested || (background.enabled && background.type === 'image') ? (
          <BackgroundImagePicker
            pending={props.pending ?? false}
            onSelect={({ file, originMediaId }) => props.onImportImage?.(file, originMediaId)}
          />
        ) : null}
        {!imageRequested && background.enabled && background.type !== 'image' ? (
          <ReviewBackgroundPaints
            value={paint}
            onPreview={(next) =>
              props.onPreview?.(
                !next
                  ? null
                  : next.kind === 'solid'
                    ? { enabled: true, type: 'solid', color: next.color }
                    : { enabled: true, type: 'gradient', gradient: next.gradient }
              )
            }
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
          onPreview={props.onPreview}
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
  onPreview,
}: {
  perspectiveFixed?: boolean | undefined;
  background: Extract<QuickEditBackgroundSettings, { enabled: true }>;
  onChange(patch: QuickEditBackgroundPatch): void;
  onPreview?: ((patch: QuickEditBackgroundPatch | null) => void) | undefined;
}) {
  const changeShadowColor = (color: string) =>
    onChange({
      layout: {
        ...background.layout,
        shadow: { intensity: background.layout.shadow?.intensity ?? 0, color },
      },
    });
  const layoutField = (key: 'padding' | 'cornerRadius', label: string) => (
    <ReviewPreviewNumberRow
      enterBehavior="blur"
      label={label}
      unit="px"
      min={0}
      max={4096}
      scrubMax={key === 'padding' ? 200 : 100}
      step={1}
      value={background.layout[key]}
      onPreview={(value) =>
        onPreview?.(value === null ? null : { layout: { ...background.layout, [key]: value } })
      }
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
        <ReviewPreviewNumberRow
          enterBehavior="blur"
          label={translate('editor.scene.backgroundBlurAmount')}
          unit="px"
          min={0}
          max={25}
          step={1}
          value={background.layout.blur ?? 0}
          onPreview={(blur) =>
            onPreview?.(blur === null ? null : { layout: { ...background.layout, blur } })
          }
          onChange={(blur) => onChange({ layout: { ...background.layout, blur } })}
        />
      ) : null}
      {layoutField('padding', translate('gallery.videoReview.backgroundPadding'))}
      {layoutField('cornerRadius', translate('gallery.videoReview.backgroundCornerRadius'))}
      <ReviewPreviewNumberRow
        enterBehavior="blur"
        label={translate('gallery.videoReview.backgroundShadow')}
        unit="%"
        min={0}
        max={100}
        step={1}
        value={background.layout.shadow?.intensity ?? 0}
        onPreview={(intensity) =>
          onPreview?.(
            intensity === null
              ? null
              : {
                  layout: {
                    ...background.layout,
                    shadow: { color: background.layout.shadow?.color ?? '#475569ff', intensity },
                  },
                }
          )
        }
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
        onPreviewChange={(color) =>
          onPreview?.({
            layout: {
              ...background.layout,
              shadow: { intensity: background.layout.shadow?.intensity ?? 0, color },
            },
          })
        }
        onPreviewReset={() => onPreview?.(null)}
      />
    </div>
  );
}
