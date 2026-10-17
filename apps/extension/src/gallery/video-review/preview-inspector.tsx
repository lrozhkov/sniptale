import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import type { useReviewWorkspaceColor } from './workspace-color';
import {
  ColorField,
  CompactSelect,
  SelectField,
  ToggleField,
} from '../../ui/compact-inspector-controls';
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
  workspaceColor?: ReturnType<typeof useReviewWorkspaceColor>;
  projectFailed?: boolean;
  onProjectRetry?: () => void;
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
    <div
      className="min-w-0 sniptale-parameter-stack"
      title={translate('gallery.videoReview.previewOnly')}
    >
      <InspectorParameterRow label={translate('gallery.videoReview.previewActualRaster')}>
        <output
          className="block w-full whitespace-nowrap px-2 text-right text-[13px] font-normal tabular-nums
          text-[var(--sniptale-color-text-primary)]"
          aria-label={translate('gallery.videoReview.previewActualRaster')}
        >
          {props.actualRaster ? `${props.actualRaster.width} × ${props.actualRaster.height}` : '—'}
        </output>
      </InspectorParameterRow>
      <InspectorParameterRow label={label('previewResolution')}>
        <div className="min-w-0 w-full">
          <CompactSelect
            appearance="plain"
            aria-label={label('previewResolution')}
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
        </div>
      </InspectorParameterRow>

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
      <ToggleField
        label={label('previewShowFrameRate')}
        disabled={props.disabled}
        value={props.preferences.showFrameRate}
        onChange={(showFrameRate) => props.onChange({ showFrameRate })}
      />
      {props.workspaceColor?.value ? (
        <ColorField
          key={props.workspaceColor.theme}
          label={translate('gallery.videoReview.workspaceColor')}
          title={translate('gallery.videoReview.workspaceColor')}
          value={props.workspaceColor.value}
          disabled={props.disabled === true}
          paletteInPicker
          allowAlpha={false}
          allowTransparent={false}
          onChange={props.workspaceColor.change}
          onPreviewChange={props.workspaceColor.preview}
          onPreviewReset={props.workspaceColor.cancel}
        />
      ) : null}
      {props.projectFailed ? (
        <div role="alert" className="space-y-1 text-xs">
          <span>{translate('gallery.videoReview.saveFailed')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            onClick={() => props.onProjectRetry?.()}
          />
        </div>
      ) : null}
      <div className="review-recognition-commands" data-ui="gallery.videoReview.previewActions">
        {props.workspaceColor ? (
          <ReviewButton
            label={translate('gallery.videoReview.workspaceColorAutomatic')}
            disabled={props.disabled}
            onClick={props.workspaceColor.reset}
          />
        ) : null}
        <ReviewButton
          label={translate('gallery.videoReview.previewReset')}
          disabled={props.disabled}
          onClick={props.onReset}
        />
      </div>
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
