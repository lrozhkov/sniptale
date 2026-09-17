import { translate } from '../../platform/i18n';
import type {
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { Trash2, RotateCcw } from 'lucide-react';
import { ReviewButton, reviewTimeLabel } from './controls';

const fieldClass =
  'w-full rounded-[var(--sniptale-radius-sm)] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-canvas)] px-2 py-1 text-sm outline-none ' +
  'focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]';

const transitionLabels: Record<QuickEditZoomTransition['type'], Parameters<typeof translate>[0]> = {
  none: 'gallery.videoReview.transitionNone',
  linear: 'gallery.videoReview.transitionLinear',
  'ease-in-out': 'gallery.videoReview.transitionSmooth',
};

/** Inspector form for the selected zoom region; edits clamp into the persisted contract. */
export function ReviewZoomInspector(props: {
  region: QuickEditZoomRegion;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onReset(): void;
  onDelete(): void;
}) {
  const { region, onChange } = props;
  const number = (value: string) => (value === '' ? undefined : Number(value));
  const transitionField = (phase: 'enter' | 'exit', label: string) => (
    <div className="flex-1 space-y-1">
      <span className="block text-xs text-[var(--sniptale-color-text-muted)]">{label}</span>
      <div className="flex gap-1">
        <select
          aria-label={label}
          className={fieldClass}
          value={region[phase].type}
          onChange={(event) =>
            onChange({
              [phase]: {
                type: event.target.value as QuickEditZoomTransition['type'],
                duration: region[phase].duration,
              },
            })
          }
        >
          {(Object.keys(transitionLabels) as QuickEditZoomTransition['type'][]).map((type) => (
            <option key={type} value={type}>
              {translate(transitionLabels[type])}
            </option>
          ))}
        </select>
        <input
          aria-label={`${label} ${translate('gallery.videoReview.zoomTransitionDuration')}`}
          className={`${fieldClass} w-16 tabular-nums`}
          type="number"
          min={0}
          max={60}
          step={0.1}
          value={region[phase].duration}
          onChange={(event) => {
            const duration = number(event.target.value);
            if (duration !== undefined) onChange({ [phase]: { ...region[phase], duration } });
          }}
        />
      </div>
    </div>
  );
  return (
    <div
      data-ui="gallery.videoReview.zoomInspector"
      className="space-y-3 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold">
          {translate('gallery.videoReview.zoomRegionLabel')} {reviewTimeLabel(region.start)}–
          {reviewTimeLabel(region.end)}
        </h4>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.zoomScale')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.zoomScale')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={1}
            max={4}
            step={0.1}
            value={region.transform.scale}
            onChange={(event) => {
              const scale = number(event.target.value);
              if (scale !== undefined) onChange({ scale });
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.zoomFocusX')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.zoomFocusX')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={region.transform.centerX}
            onChange={(event) => {
              const centerX = number(event.target.value);
              if (centerX !== undefined) onChange({ centerX });
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.zoomFocusY')}
          </span>
          <input
            aria-label={translate('gallery.videoReview.zoomFocusY')}
            className={`${fieldClass} tabular-nums`}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={region.transform.centerY}
            onChange={(event) => {
              const centerY = number(event.target.value);
              if (centerY !== undefined) onChange({ centerY });
            }}
          />
        </label>
      </div>
      <div className="flex gap-2">
        {transitionField('enter', translate('gallery.videoReview.zoomTransitionIn'))}
        {transitionField('exit', translate('gallery.videoReview.zoomTransitionOut'))}
      </div>
      <div className="flex gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.zoomResetPosition')}
          className="flex-1 !border-0 !bg-transparent !shadow-none !text-xs"
          onClick={props.onReset}
        >
          <RotateCcw size={14} />
          <span>{translate('gallery.videoReview.zoomResetPosition')}</span>
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.zoomDelete')}
          className="!border-0 !bg-transparent !shadow-none !text-xs !text-[var(--sniptale-color-danger)]"
          onClick={props.onDelete}
        >
          <Trash2 size={14} />
        </ReviewButton>
      </div>
    </div>
  );
}
