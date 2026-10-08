import { SelectField } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';
import {
  QUICK_PREVIEW_RASTER_PRESETS,
  QUICK_PREVIEW_FRAME_RATES,
  type QuickPreviewPreferences,
} from '../../features/video/preview/quick-preferences';
import type { useReviewPreviewPreferences } from './use-preview-preferences';
import { ReviewButton, reviewSelectFieldClassName } from './controls';

/** Runtime supplies actual dimensions; this panel owns no rendering or persisted project state. */
type ReviewPreviewInspectorBinding = {
  preferences: QuickPreviewPreferences;
  status: ReturnType<typeof useReviewPreviewPreferences>['status'];
  actualRaster: { width: number; height: number } | null;
  disabled?: boolean | undefined;
  onChange(patch: Partial<QuickPreviewPreferences>): void;
  onReset(): void;
  onRetry(): void;
};

/** Local workstation preferences remain independent of scene and export settings. */
export function ReviewPreviewInspector(props: ReviewPreviewInspectorBinding) {
  useAppLocale();
  const label = (
    key: 'previewResolution' | 'previewFrameRate' | 'previewPaused' | 'previewShowFrameRate'
  ) => translate(`gallery.videoReview.${key}`);
  return (
    <div className="min-w-0 space-y-3" title={translate('gallery.videoReview.previewOnly')}>
      <SelectField
        className={reviewSelectFieldClassName}
        label={label('previewResolution')}
        disabled={props.disabled}
        value={props.preferences.rasterPreset}
        options={QUICK_PREVIEW_RASTER_PRESETS.map((value) => ({
          value,
          label: value === 'current' ? translate('gallery.videoReview.previewCurrent') : value,
        }))}
        onChange={(rasterPreset: QuickPreviewPreferences['rasterPreset']) =>
          props.onChange({ rasterPreset })
        }
      />
      <p
        className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]"
        aria-label={translate('gallery.videoReview.previewActualRaster')}
      >
        {props.actualRaster ? `${props.actualRaster.width} × ${props.actualRaster.height}` : '—'}
      </p>
      <div title={translate('gallery.videoReview.previewFrameRateLimit')}>
        <SelectField
          className={reviewSelectFieldClassName}
          label={label('previewFrameRate')}
          disabled={props.disabled}
          value={props.preferences.frameRate}
          options={QUICK_PREVIEW_FRAME_RATES.map((value) => ({
            value,
            label:
              value === 'current'
                ? translate('gallery.videoReview.previewCurrent')
                : `≤ ${value} FPS`,
          }))}
          onChange={(frameRate: QuickPreviewPreferences['frameRate']) =>
            props.onChange({ frameRate })
          }
        />
      </div>
      <SelectField
        className={reviewSelectFieldClassName}
        label={label('previewPaused')}
        disabled={props.disabled}
        value={props.preferences.pausedQuality}
        options={[
          { value: 'same', label: translate('gallery.videoReview.previewPausedSame') },
          { value: 'detailed', label: translate('gallery.videoReview.previewPausedDetailed') },
        ]}
        onChange={(pausedQuality: QuickPreviewPreferences['pausedQuality']) =>
          props.onChange({ pausedQuality })
        }
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={label('previewShowFrameRate')}
        disabled={props.disabled}
        value={props.preferences.showFrameRate ? 'on' : 'off'}
        options={[
          { value: 'off', label: translate('gallery.videoReview.previewOff') },
          { value: 'on', label: translate('gallery.videoReview.previewOn') },
        ]}
        onChange={(value: 'on' | 'off') => props.onChange({ showFrameRate: value === 'on' })}
      />
      <ReviewButton
        label={translate('gallery.videoReview.previewReset')}
        disabled={props.disabled}
        onClick={props.onReset}
      />
      {props.status === 'session-only' ? (
        <div role="status" className="space-y-1 text-xs text-[var(--sniptale-color-text-muted)]">
          <span>{translate('gallery.videoReview.previewSessionOnly')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            disabled={props.disabled}
            onClick={props.onRetry}
          />
        </div>
      ) : null}
    </div>
  );
}
