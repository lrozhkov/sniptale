import { documentAutosaveLabels } from '../../ui/document-autosave-labels';
import { ReviewTrackRow } from './track-row';
import { ReviewKeyboardHelp } from './keyboard-help';
import { reviewWheelZoom } from './timeline-geometry';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReviewPlaybackRange } from './playback-range';
import { ReviewResetControl } from './reset-control';
import { AutosaveControl } from '@sniptale/ui/autosave-control';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import './timeline-toolbar.css';
import { useReviewToolbarLayout } from './use-toolbar-layout';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import {
  X,
  Repeat2,
  Play,
  SkipBack,
  SkipForward,
  BetweenHorizontalStart,
  Undo2,
  Redo2,
  StickyNote,
  FileVideo,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import { CompactRange } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import { reviewIconButtonClassName, ReviewButton, reviewTimeLabel } from './controls';

/** Useful ruler units at the current zoom; labels do not contribute to canvas width. */
export function ReviewRuler({
  duration,
  width,
  interaction,
}: {
  duration: number;
  width: number;
  interaction?: HTMLAttributes<HTMLDivElement>;
}) {
  const required = duration / Math.max(1, width / 80);
  const magnitude = 10 ** Math.floor(Math.log10(required));
  const major =
    [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= required) ??
    magnitude * 10;
  const minor = major / 5;
  const count = Math.min(2000, Math.floor(duration / minor));
  return (
    <div
      data-ui="gallery.videoReview.ruler"
      aria-hidden={interaction ? undefined : true}
      {...interaction}
      className="relative h-7 select-none overflow-hidden outline-none focus-visible:ring-1
        focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-accent)] touch-none"
    >
      {Array.from({ length: count + 1 }, (_, index) => {
        const time = index * minor;
        const labelled = index % 5 === 0;
        return (
          <div
            key={index}
            className="absolute bottom-0 border-l border-[var(--sniptale-color-border-soft)]"
            style={{ left: `${(time / duration) * 100}%`, height: labelled ? 9 : 4 }}
          >
            {labelled ? (
              <span
                className="absolute -top-4 left-1 whitespace-nowrap text-[10px] tabular-nums
                  text-[var(--sniptale-color-text-muted)]"
              >
                {major >= 1 ? reviewTimeLabel(time).replace(/\.0$/, '') : reviewTimeLabel(time)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Sticky ruler chrome shares the track coordinate system and keeps its marker above scrolled lanes. */
export function ReviewRulerRow(props: {
  time: number;
  duration: number;
  gutter: number;
  width: number;
  controls: ReactNode;
  interaction: HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div
      data-ui="gallery.videoReview.rulerRow"
      className="sticky top-0 z-40 bg-[var(--sniptale-color-surface-panel)]"
    >
      <ReviewTrackRow ruler label="" icon={props.controls}>
        <ReviewRuler
          duration={props.duration}
          width={props.width}
          interaction={props.interaction}
        />
      </ReviewTrackRow>
      <ReviewPlayhead
        ruler
        time={props.time}
        duration={props.duration}
        gutter={props.gutter}
        width={props.width}
      />
    </div>
  );
}

const plain = reviewIconButtonClassName;

function playbackTime(value: number): string {
  return formatPreciseTime(Math.round(value * 100) / 100).slice(0, -1);
}

/** The maximum source-clock format reserves space without changing the live readout. */
function ReviewPlaybackClock(props: { time: number; duration: number }) {
  const sample = playbackTime(props.duration).replace(/\d/g, '8');
  return (
    <span className="review-playback-clock whitespace-nowrap text-xs font-semibold tabular-nums">
      <span aria-hidden="true" className="invisible">
        {sample} / {playbackTime(props.duration)}
      </span>
      <span className="review-playback-clock-value">
        {playbackTime(props.time)} / {playbackTime(props.duration)}
      </span>
    </span>
  );
}

/** Disposable loop readout and reset beside the transport clock. */
function ReviewLoopSummary(props: {
  range?: ReviewPlaybackRange | null | undefined;
  busy?: boolean | undefined;
  onClear?: (() => void) | undefined;
}) {
  return props.range ? (
    <div
      data-ui="gallery.videoReview.loopSummary"
      className="flex items-center justify-center gap-1 text-xs font-semibold tabular-nums
                text-[var(--sniptale-color-accent-emphasis)] whitespace-nowrap"
      title={[
        translate('gallery.videoReview.playbackRange'),
        `${formatPreciseTime(props.range.start)} – ${formatPreciseTime(props.range.end)}`,
      ].join(': ')}
    >
      <Repeat2 size={12} aria-hidden="true" />
      <span>
        {playbackTime(props.range.start)} – {playbackTime(props.range.end)}
      </span>
      <ContentToolbarButton
        disabled={props.busy}
        title={translate('gallery.videoReview.clearPlaybackRange')}
        tone="utility"
        size="compact"
        onKeyDown={(event) => {
          if (event.key === ' ') event.stopPropagation();
        }}
        onClick={props.onClear}
      >
        <X size={12} aria-hidden="true" />
      </ContentToolbarButton>
    </div>
  ) : null;
}

/** Source-time cursor shared by all timeline lanes. */
export function ReviewPlayhead(props: {
  ruler?: boolean;
  time: number;
  duration: number;
  gutter: number;
  width: number;
}) {
  return (
    <div
      aria-hidden="true"
      data-ui={props.ruler ? 'gallery.videoReview.rulerPlayhead' : 'gallery.videoReview.playhead'}
      className={`pointer-events-none absolute ${props.ruler ? 'bottom-0' : 'bottom-2'} top-0 z-20
        bg-[var(--sniptale-color-accent-emphasis)] group-focus-visible/plane:brightness-125`}
      style={{
        left:
          props.gutter + Math.max(0, Math.min(1, props.time / props.duration)) * props.width - 5,
        width: 10,
        clipPath: 'polygon(0 0, 100% 0, 55% 8px, 55% 100%, 45% 100%, 45% 8px)',
      }}
    />
  );
}

/** Editing tools, centered transport and viewport controls share one quiet toolbar. */
export function ReviewToolbar(props: {
  busy?: boolean;
  playbackRange?: ReviewPlaybackRange | null | undefined;
  onClearPlaybackRange?(): void;
  duration: number;
  time: number;
  playing: boolean;
  resultDuration?: number;
  historyControls?: ReactNode;
  tools?: ReactNode;
  expandedTools?: boolean;
  onPlay(): void;
  onOpenExport?: (() => void) | undefined;
  exportActive?: boolean | undefined;
  navigation: { start: number; end: number };
  onNavigate(time: number): void;
  zoom: number;
  onZoom(value: number): void;
}) {
  const toolbar = useReviewToolbarLayout();
  return (
    <div ref={toolbar} data-ui="gallery.videoReview.toolbar" className="review-timeline-toolbar">
      <div data-toolbar-side="leading" className="flex min-w-0 items-center">
        {props.tools}
      </div>
      <div data-toolbar-transport className="flex shrink-0 items-center justify-center gap-2">
        <ReviewButton
          label={translate('gallery.videoReview.timelineStart')}
          className={plain}
          disabled={Math.abs(props.time - props.navigation.start) < 0.0001}
          onClick={() => props.onNavigate(props.navigation.start)}
        >
          <SkipBack size={16} strokeWidth={2.2} aria-hidden="true" />
        </ReviewButton>
        <ReviewButton
          label={translate(
            props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
          )}
          onClick={props.onPlay}
          disabled={props.busy}
          className={plain}
        >
          {props.playing ? (
            <svg viewBox="0 0 16 16" className="!size-4" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="2" height="10" />
              <rect x="10" y="3" width="2" height="10" />
            </svg>
          ) : (
            <Play size={16} strokeWidth={2.2} aria-hidden="true" />
          )}
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.timelineEnd')}
          className={plain}
          disabled={Math.abs(props.time - props.navigation.end) < 0.0001}
          onClick={() => props.onNavigate(props.navigation.end)}
        >
          <SkipForward size={16} strokeWidth={2.2} aria-hidden="true" />
        </ReviewButton>
        <div className="min-w-0 text-center">
          {props.playbackRange ? (
            <ReviewLoopSummary
              range={props.playbackRange}
              busy={props.busy}
              onClear={props.onClearPlaybackRange}
            />
          ) : (
            <ReviewPlaybackClock time={props.time} duration={props.duration} />
          )}
        </div>
        {!props.playbackRange &&
        props.resultDuration !== undefined &&
        Math.abs(props.resultDuration - props.duration) > 0.05 ? (
          <output
            title={translate('gallery.videoReview.resultDuration')}
            className="ml-1 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]"
          >
            → {reviewTimeLabel(props.resultDuration)}
          </output>
        ) : null}
      </div>
      <div data-toolbar-side="trailing" className="flex min-w-0 items-center justify-end gap-0.5">
        <div
          data-ui="gallery.videoReview.noteHistoryTools"
          className="flex min-w-max flex-1 items-center justify-center"
        >
          {props.historyControls}
        </div>
        <ReviewZoomSlider value={props.zoom} onChange={props.onZoom} />
        <ReviewButton
          label={translate('gallery.videoReview.fit')}
          className={plain}
          onClick={() => props.onZoom(1)}
        >
          <BetweenHorizontalStart size={16} strokeWidth={2} />
        </ReviewButton>
        {props.onOpenExport ? (
          <>
            <ReviewToolbarSeparator />
            <ReviewButton
              data-ui="gallery.videoReview.openExport"
              label={translate('gallery.videoReview.exportSection')}
              toolbarLabel={translate('gallery.videoReview.exportSection')}
              toolbarPriority={3}
              aria-pressed={!!props.exportActive}
              className={plain}
              onClick={props.onOpenExport}
            >
              <FileVideo size={16} aria-hidden="true" />
            </ReviewButton>
          </>
        ) : null}
        <ReviewKeyboardHelp />
      </div>
    </div>
  );
}

/** Native non-passive wheel handling keeps zoom gestures out of parent scroll containers. */
function ReviewZoomSlider(props: { value: number; onChange(value: number): void }) {
  const { value, onChange } = props;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || node.disabled) return;
      const next = reviewWheelZoom(value, event);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (next !== value) onChange(next);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [value, onChange]);
  return (
    <CompactRange
      ref={ref}
      aria-label={translate('videoEditor.timeline.zoom')}
      title={translate('videoEditor.timeline.zoom')}
      min={0}
      max={100}
      step={0.1}
      value={Math.log2(props.value) * 25}
      onChange={(event) => props.onChange(2 ** (event.currentTarget.valueAsNumber / 25))}
      style={
        {
          width: 80,
          minWidth: 80,
          '--sniptale-range-track-height': '3px',
          '--sniptale-color-accent': 'var(--sniptale-color-text-dim)',
        } as CSSProperties
      }
    />
  );
}

/** History commands share the session transaction path used by keyboard shortcuts. */
export function ReviewHistoryControls(props: {
  busy: boolean;
  cursor: number;
  length: number;
  onHistory(
    direction: import('../../features/video/review/types').ReviewHistoryDirection | 'reset'
  ): void | Promise<unknown>;
  onAddNote?(): void;
  autosave?: {
    enabled: boolean;
    error: string | null;
    errorMessage: string | null;
    dirty: boolean;
    saving: boolean;
    busy: boolean;
    onReload(): Promise<void>;
    onChange(enabled: boolean): void;
  };
}) {
  return (
    <>
      {props.onAddNote ? (
        <ReviewButton
          label={translate('gallery.videoReview.addComment')}
          toolbarPriority={2}
          toolbarLabel={translate('gallery.videoReview.toolbarNote')}
          className={plain}
          disabled={props.busy}
          onClick={props.onAddNote}
        >
          <StickyNote size={16} aria-hidden="true" />
        </ReviewButton>
      ) : null}
      {props.onAddNote ? <ReviewToolbarSeparator /> : null}
      {(['undo', 'redo'] as const).map((direction) => (
        <ReviewButton
          key={direction}
          chrome
          label={translate(`gallery.videoReview.${direction}`)}
          className={plain}
          disabled={
            props.busy || (direction === 'undo' ? props.cursor === 0 : props.cursor >= props.length)
          }
          onClick={() => props.onHistory(direction)}
        >
          {direction === 'undo' ? <Undo2 size={16} /> : <Redo2 size={16} />}
        </ReviewButton>
      ))}
      <ReviewResetControl
        busy={props.busy}
        cursor={props.cursor}
        autosaveEnabled={props.autosave?.enabled ?? true}
        onStart={async () => props.onHistory('start')}
        onReset={async () => props.onHistory('reset')}
      />
      {props.autosave && (
        <>
          <ReviewToolbarSeparator />
          <ReviewAutosaveControl {...props.autosave} />
          <ReviewToolbarSeparator compactOnly />
        </>
      )}
    </>
  );
}

function ReviewToolbarSeparator({ compactOnly = false }: { compactOnly?: boolean }) {
  return (
    <span
      data-ui="gallery.videoReview.toolbar.separator"
      data-compact-only={compactOnly || undefined}
      aria-hidden="true"
      className="mx-1 h-4 w-px shrink-0 self-center bg-[var(--sniptale-color-border-soft)]"
    />
  );
}

function ReviewAutosaveControl(props: {
  enabled: boolean;
  error: string | null;
  errorMessage: string | null;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  onReload(): Promise<void>;
  onChange(enabled: boolean): void;
}) {
  const [confirmReload, setConfirmReload] = useState(false);
  let state: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' = 'saved';
  if (props.dirty) state = 'dirty';
  if (props.saving) state = 'saving';
  if (props.error) state = props.error === 'conflict' ? 'conflict' : 'error';
  return (
    <>
      <AutosaveControl
        enabled={props.enabled}
        onChange={props.onChange}
        state={state}
        openOnError
        actions={
          props.error ? (
            <ProductActionButton
              compact
              tone="secondary"
              disabled={props.busy}
              onClick={() => setConfirmReload(true)}
            >
              {translate('gallery.videoReview.reload')}
            </ProductActionButton>
          ) : null
        }
        labels={{
          ...documentAutosaveLabels(),
          errorDescription:
            props.errorMessage ?? translate('editor.documentActions.autosaveErrorDescription'),
          conflict: translate('editor.documentActions.autosaveConflict'),
        }}
      />
      <ProductConfirmDialog
        dialogClassName="sniptale-compact-workspace"
        isOpen={confirmReload}
        isLoading={props.busy}
        title={translate('gallery.videoReview.reload')}
        message={translate('editor.documentActions.autosaveReloadWarning')}
        confirmText={translate('gallery.videoReview.reload')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setConfirmReload(false)}
        onConfirm={async () => {
          await props.onReload();
          setConfirmReload(false);
        }}
      />
    </>
  );
}
