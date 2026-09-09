import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { InspectorActionButton } from '../shared/actions';
import { translate } from '../../../../../platform/i18n';
import type { VideoProject } from '../../../../../features/video/project/types';
import { planClipSwap, type ClipSwapPlan } from '../../../../project/state/clip-timeline/reorder';
import type { VideoEditorProjectActions } from '../../../../contracts/commands/project';

const REASON_KEYS = {
  'no-neighbor': 'videoEditor.app.clipSwapNoNeighbor',
  overlap: 'videoEditor.app.clipSwapOverlap',
  locked: 'videoEditor.app.clipSwapLocked',
  collision: 'videoEditor.app.clipSwapCollision',
} as const;

export function ClipOrderControls(props: {
  project: VideoProject;
  clipId: string;
  onSwapClip: VideoEditorProjectActions['swapClip'];
}) {
  const descriptionId = useId();
  const left = planClipSwap(props.project, props.clipId, 'left');
  const right = planClipSwap(props.project, props.clipId, 'right');
  return (
    <div data-ui="video-editor.inspector.clip-order" className="group/clip-order space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span
          className="shrink-0 text-xs text-[var(--sniptale-color-text-secondary)]"
          title={translate('videoEditor.app.clipSwapLinkedHint')}
        >
          {translate('videoEditor.app.clipOrder')}
        </span>
        <div className="ml-auto flex shrink-0 gap-1">
          {(['left', 'right'] as const).map((direction) => {
            const plan = direction === 'left' ? left : right;
            const label = translate(
              direction === 'left' ? 'videoEditor.app.clipEarlier' : 'videoEditor.app.clipLater'
            );
            const Icon = direction === 'left' ? ArrowLeft : ArrowRight;
            return (
              <span key={direction} title={planHint(plan)}>
                <InspectorActionButton
                  compact
                  tone="secondary"
                  className="!h-7 !min-w-7 !px-1.5"
                  disabled={plan.status !== 'ready'}
                  aria-describedby={`${descriptionId}-${direction}`}
                  onClick={() => props.onSwapClip(props.clipId, direction)}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{label}</span>
                </InspectorActionButton>
              </span>
            );
          })}
        </div>
      </div>
      <div
        data-ui="video-editor.inspector.clip-order.descriptions"
        className={[
          'sr-only text-[11px] leading-relaxed text-[var(--sniptale-color-text-muted)]',
          'group-focus-within/clip-order:not-sr-only',
        ].join(' ')}
      >
        <p id={`${descriptionId}-left`}>
          {translate('videoEditor.app.clipEarlier')}: {planHint(left)}
        </p>
        <p id={`${descriptionId}-right`}>
          {translate('videoEditor.app.clipLater')}: {planHint(right)}
        </p>
      </div>
      {left.status === 'unavailable' && right.status === 'unavailable' ? (
        <p className="text-[11px] leading-relaxed text-[var(--sniptale-color-text-muted)]">
          {planHint(left.reason === 'no-neighbor' ? right : left)}
        </p>
      ) : null}
    </div>
  );
}

function planHint(plan: ClipSwapPlan): string {
  return plan.status === 'ready'
    ? translate('videoEditor.app.clipSwapNeighbor').replace('{name}', plan.neighborName)
    : translate(REASON_KEYS[plan.reason]);
}
