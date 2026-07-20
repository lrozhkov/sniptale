import { Plus } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

export interface MotionLaneAddPreview {
  left: number;
  time: number;
}

export function ProjectTimelineMotionLaneAddPreview({
  onAddMotionRegion,
  onClearPreview,
  preview,
}: {
  onAddMotionRegion: ((startTime?: number) => void) | undefined;
  onClearPreview: () => void;
  preview: MotionLaneAddPreview | null;
}) {
  if (!preview) {
    return null;
  }

  const label = translate('videoEditor.timeline.addZoomRegion');
  return (
    <div className="pointer-events-none absolute inset-y-1 z-20" style={{ left: preview.left }}>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={[
          'pointer-events-auto absolute left-0 top-1/2 flex h-7 w-7 -translate-y-1/2',
          'items-center justify-center rounded-[6px] border',
          'border-[color:var(--sniptale-color-border-accent-strong)]',
          'bg-[color:var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
          'shadow-[0_2px_8px_color-mix(in_srgb,var(--sniptale-color-text-primary)_14%,transparent)]',
          'hover:bg-[color:var(--sniptale-color-accent-soft)]',
        ].join(' ')}
        data-project-timeline-motion-add-preview="true"
        onClick={(event) => {
          event.stopPropagation();
          onAddMotionRegion?.(preview.time);
          onClearPreview();
        }}
      >
        <Plus size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}
