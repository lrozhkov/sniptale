import { translate } from '../../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  createDuplicatedMotionPathStop,
  insertMotionPathStop,
} from '../../../../../project/motion-path/edits';
import { isCameraCursorObjectTrack } from '../../../../../../features/video/project/object-tracks';
import { canGenerateMotionPathFromCursorTrack } from '../../../../../project/motion-path/cursor-track';
import type { MotionPathEditorProps } from './shared';
import { PATH_CARD_CLASS_NAME, patchMotionPath } from './shared';
import { PANEL_META_CLASS_NAME } from '../../shared/panel';

export function MotionPathActions(props: MotionPathEditorProps) {
  const hasCursorSource =
    props.panel.project.baseRecordingId !== null ||
    (props.panel.project.objectTracks ?? []).some(
      (track) =>
        isCameraCursorObjectTrack(track) &&
        canGenerateMotionPathFromCursorTrack({
          project: props.panel.project,
          region: props.motionRegion,
          track,
        })
    );

  return (
    <div className="flex flex-wrap gap-2">
      <ProductActionButton compact tone="primary" onClick={() => handleAddStop(props)}>
        {translate('videoEditor.sidebar.motionPathAddStop')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        disabled={!hasCursorSource}
        onClick={() => props.panel.onGenerateMotionPathFromCursor?.(props.motionRegion.id)}
      >
        {translate('videoEditor.sidebar.motionPathGenerateFromCursor')}
      </ProductActionButton>
    </div>
  );
}

function handleAddStop(props: MotionPathEditorProps) {
  const lastStop = props.path.stops[props.path.stops.length - 1];
  if (!lastStop) {
    return;
  }

  const stop = createDuplicatedMotionPathStop(props.panel.project, lastStop, 1);
  patchMotionPath(
    props.panel,
    props.motionRegion.id,
    insertMotionPathStop(props.path, stop, props.path.stops.length)
  );
}

export function MotionPathTimeline(props: { path: MotionPathEditorProps['path'] }) {
  return (
    <section className={PATH_CARD_CLASS_NAME}>
      <div className="flex items-center justify-between gap-3">
        <p className={PANEL_META_CLASS_NAME}>
          {translate('videoEditor.sidebar.motionPathTimeline')}
        </p>
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {props.path.stops.length} {translate('videoEditor.sidebar.motionPathStopCountUnit')}
        </span>
      </div>
      <div className="relative h-10">
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full
            bg-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_70%,transparent)]"
        />
        {props.path.stops.map((stop, index) => (
          <div
            key={stop.id}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${stop.offset * 100}%` }}
          >
            <div
              className="mx-auto flex h-6 w-6 items-center justify-center rounded-full border
                border-[color:var(--sniptale-color-border-accent-strong)]
                bg-[var(--sniptale-color-accent-soft)] text-[11px] font-semibold
                text-[var(--sniptale-color-accent-text)]"
            >
              {index + 1}
            </div>
            <div className="mt-1 text-[10px] text-[var(--sniptale-color-text-secondary)]">
              {Math.round(stop.offset * 100)}%
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
