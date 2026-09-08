import { useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { formatNumber, translate, useAppLocale } from '../../../../../platform/i18n';
import {
  planTypingCompression,
  resolveTypingSpanSource,
} from '../../../../project/state/clip-timeline/source-range';
import type { VideoEditorTypingSpanTarget } from '../../../../contracts/commands/timeline';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { SelectInput } from '../shared/controls';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';

type Props = Pick<
  WorkspaceSidebarSelectionPanelProps,
  'project' | 'typingProject' | 'recordingTelemetry' | 'onApplyTypingCompression'
> & { target: VideoEditorTypingSpanTarget };
type Preview = {
  project: Props['project'];
  rate: number;
  plan: ReturnType<typeof planTypingCompression>;
};

function TypingPreviewSummary({ plan }: { plan: Extract<Preview['plan'], { status: 'ready' }> }) {
  const locale = useAppLocale();
  const seconds = (value: number) => {
    const amount = formatNumber(
      value,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      locale
    );
    return `${amount} ${translate('videoEditor.sidebar.typingSeconds')}`;
  };
  const details = [
    ['typingDuration', `${seconds(plan.previousDuration)} → ${seconds(plan.nextDuration)}`],
    ['typingProjectDelta', seconds(plan.projectDurationDelta)],
    [
      'typingTail',
      `${plan.shiftedClipIds.length} · −${seconds(plan.shiftedClipIds.length ? plan.removedDuration : 0)}`,
    ],
    ['typingLinked', String(plan.affectedClipIds.length)],
  ] as const;
  return (
    <dl className="space-y-2 text-xs" aria-live="polite">
      {details.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-[var(--sniptale-color-text-secondary)]">
            {translate(`videoEditor.sidebar.${label}`)}
          </dt>
          <dd className="m-0 shrink-0 tabular-nums text-[var(--sniptale-color-text-primary)]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InspectHistorySpanPanel(props: Props) {
  const {
    source,
    currentRate,
    rate,
    unavailable,
    locked,
    stale,
    plan,
    applyStatus,
    recalculate,
    changeRate,
    apply,
  } = useTypingCompression(props);
  return (
    <section
      className={PANEL_SECTION_CLASS_NAME}
      data-ui="video-editor.inspector.history-span"
      data-history-clip-id={props.target.clipId}
      data-history-signal-id={props.target.signalId}
    >
      <p className="flex min-w-0 items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
        <span className="min-w-0 truncate" title={source?.clip.name}>
          {source?.clip.name ?? translate('videoEditor.sidebar.typingUnavailable')}
        </span>
        {source ? (
          <span className="shrink-0" title={translate('videoEditor.sidebar.typingCurrentRate')}>
            · {currentRate}×
          </span>
        ) : null}
      </p>
      <SelectInput
        label={translate('videoEditor.sidebar.typingTargetRate')}
        value={String(rate)}
        disabled={unavailable}
        options={[...new Set([currentRate, 2, 4, 8])]
          .sort((a, b) => a - b)
          .map((value) => ({ value: String(value), label: `${value}×` }))}
        onChange={changeRate}
      />
      <TypingCompressionStatus
        unavailable={unavailable}
        locked={Boolean(locked)}
        stale={stale}
        plan={plan}
        applyStatus={applyStatus}
      />
      <div
        className={`flex flex-wrap items-center justify-end gap-1 border-t
border-[color:var(--sniptale-color-border-soft)] pt-2`}
      >
        <ProductActionButton
          data-ui="video-editor.typing.preview"
          compact
          tone="secondary"
          disabled={unavailable}
          onClick={recalculate}
        >
          {translate('videoEditor.sidebar.typingPreview')}
        </ProductActionButton>
        <ProductActionButton
          data-ui="video-editor.typing.apply"
          compact
          tone="primary"
          disabled={unavailable || stale || plan?.status !== 'ready'}
          onClick={apply}
        >
          {translate('videoEditor.sidebar.typingApply')}
        </ProductActionButton>
      </div>
    </section>
  );
}

function TypingCompressionStatus({
  unavailable,
  locked,
  stale,
  plan,
  applyStatus,
}: {
  unavailable: boolean;
  locked: boolean;
  stale: boolean;
  plan: Preview['plan'] | undefined;
  applyStatus: string | null;
}) {
  return (
    <>
      {unavailable ? (
        <p role="status">
          {translate(
            locked ? 'videoEditor.sidebar.typingLocked' : 'videoEditor.sidebar.typingUnavailable'
          )}
        </p>
      ) : null}
      {stale ? <p role="status">{translate('videoEditor.sidebar.typingStale')}</p> : null}
      {plan?.status === 'ready' ? (
        <TypingPreviewSummary plan={plan} />
      ) : plan ? (
        <p role="status">
          {translate(
            plan.status === 'unchanged'
              ? 'videoEditor.sidebar.typingUnchanged'
              : plan.reason === 'locked'
                ? 'videoEditor.sidebar.typingLocked'
                : 'videoEditor.sidebar.typingBlocked'
          )}
        </p>
      ) : null}
      {applyStatus === 'blocked' ? (
        <p role="status">{translate('videoEditor.sidebar.typingBlocked')}</p>
      ) : null}
    </>
  );
}

function useTypingCompression(props: Props) {
  const project = props.typingProject;
  const telemetry = props.recordingTelemetry ?? [];
  const source = project ? resolveTypingSpanSource(project, telemetry, props.target) : null;
  const currentRate = source?.clip.playbackRate ?? 1;
  const [rate, setRate] = useState(currentRate);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const request = { ...props.target, targetPlaybackRate: rate };
  const stale =
    Boolean(preview && (preview.project !== project || preview.rate !== rate)) ||
    applyStatus === 'stale';
  const locked =
    source && project?.tracks.find((track) => track.id === source.clip.trackId)?.locked;
  const unavailable = !source || Boolean(locked) || !props.onApplyTypingCompression;
  const plan = preview?.plan;
  const recalculate = () => {
    if (!project) return;
    setPreview({ project, rate, plan: planTypingCompression(project, telemetry, request) });
    setApplyStatus(null);
  };
  const apply = () => {
    if (!preview || preview.plan.status !== 'ready' || stale || unavailable) return;
    const result = props.onApplyTypingCompression?.(request, preview.project);
    setApplyStatus(result?.status ?? 'blocked');
    if (result?.status === 'applied' || result?.status === 'unchanged') setPreview(null);
  };
  const changeRate = (value: string) => {
    setRate(Number(value));
    setApplyStatus(null);
  };
  return {
    source,
    currentRate,
    rate,
    unavailable,
    locked,
    stale,
    plan,
    applyStatus,
    recalculate,
    changeRate,
    apply,
  };
}
