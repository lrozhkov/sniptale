import { Grip } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { translate } from '../../../platform/i18n';
import { registerContentOwnedPassiveChrome } from '../../platform/dom-host';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import {
  getDesignReviewActionOption,
  getDesignReviewActionTone,
} from '../design-review/action-catalog';
import {
  getDesignReviewRecordAction,
  isDesignReviewFeedbackRecord,
} from '../design-review/records';
import { useAnnotationMarkerDrag } from './drag';
import {
  useMarkerPositions,
  type AnnotationMarkerOffset,
  type AnnotationMarkerPosition,
  type AnnotationMarkerProjection,
} from './position';
import { AnnotationMarkerTooltip, handleTooltipScroll } from './tooltip';

const ZERO_OFFSET: AnnotationMarkerOffset = { x: 0, y: 0 };

function usePassiveContentChromeRef<T extends Element>() {
  const cleanupRef = useRef<() => void>(() => undefined);
  const ref = useCallback((element: T | null) => {
    cleanupRef.current();
    cleanupRef.current = registerContentOwnedPassiveChrome(element);
  }, []);
  useLayoutEffect(() => () => cleanupRef.current(), []);
  return ref;
}

function AnnotationMarker(
  props: AnnotationMarkerProjection & {
    interactive: boolean;
    showChrome: boolean;
    offset: AnnotationMarkerOffset;
    onOffsetChange: (offset: AnnotationMarkerOffset) => void;
    onOpenRecord?: (annotationId: number) => boolean;
    position: AnnotationMarkerPosition | undefined;
  }
) {
  const tooltipScrollRef = useRef<HTMLSpanElement>(null);
  const markerGroupRef = usePassiveContentChromeRef<HTMLDivElement>();
  const markerButtonRef = usePassiveContentChromeRef<HTMLButtonElement>();
  const drag = useAnnotationMarkerDrag({
    offset: props.offset,
    onChange: props.onOffsetChange,
    target: props.target,
  });
  if (!props.position || props.record.markerNumber === undefined) return null;

  const action = getDesignReviewRecordAction(props.record);
  const option = getDesignReviewActionOption(action);
  const Icon = option.icon;
  const tooltipId = `sniptale-design-review-feedback-${props.record.annotationId}`;
  const markerLabel = [
    translate('content.designReview.markerNumberLabel'),
    `${props.record.markerNumber}:`,
    translate(option.labelKey),
  ].join(' ');

  return (
    <div
      className="group pointer-events-none fixed"
      data-annotation-id={props.record.annotationId}
      data-ui="content.annotation-marker"
      ref={markerGroupRef}
      style={{
        left: props.position.markerLeft ?? undefined,
        right: props.position.markerRight ?? undefined,
        top: props.position.markerTop,
      }}
    >
      <button
        type="button"
        aria-describedby={props.showChrome ? tooltipId : undefined}
        aria-label={markerLabel}
        className={[
          'inline-flex min-w-8 items-center justify-center gap-0.5',
          'box-border h-8 max-w-[calc(100vw-8px)] overflow-hidden rounded-full border-solid',
          'border-[color:var(--sniptale-color-surface-canvas)]',
          'bg-[var(--sniptale-color-surface-canvas)] px-1.5 text-[10px] font-bold',
          'text-[var(--sniptale-color-text-primary)] shadow-lg outline-none',
          'focus-visible:border-[color:var(--sniptale-color-accent)]',
          props.showChrome ? 'pointer-events-auto' : 'pointer-events-none',
          props.interactive ? 'cursor-pointer' : 'cursor-help',
        ].join(' ')}
        data-ui="content.annotation-marker-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (props.interactive) props.onOpenRecord?.(props.record.annotationId);
        }}
        onKeyDown={(event) => handleTooltipScroll(event, tooltipScrollRef.current)}
        ref={markerButtonRef}
        style={{ borderWidth: 3 }}
        tabIndex={props.showChrome ? 0 : -1}
      >
        <Icon
          aria-hidden="true"
          className={`pointer-events-none ${getDesignReviewActionTone(action)}`}
          size={13}
          strokeWidth={2.25}
        />
        <span className="pointer-events-none truncate">{props.record.markerNumber}</span>
      </button>
      {props.showChrome && props.interactive ? (
        <button
          type="button"
          aria-label={translate('content.designReview.moveMarker')}
          className={[
            'sniptale-annotation-marker-drag-handle pointer-events-auto absolute',
            '-right-1 -top-3 hidden h-5 w-5 touch-none',
            'items-center justify-center rounded-full border shadow-md',
            'border-[color:var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)] group-hover:inline-flex',
            'group-focus-within:inline-flex cursor-grab active:cursor-grabbing',
          ].join(' ')}
          data-ui="content.annotation-marker-drag-handle"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerCancel={drag.onPointerUp}
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <Grip size={11} />
        </button>
      ) : null}
      {props.showChrome ? (
        <AnnotationMarkerTooltip
          id={tooltipId}
          position={props.position}
          record={props.record}
          scrollRef={tooltipScrollRef}
        />
      ) : null}
    </div>
  );
}

function createMarkerProjections(_revision: number): AnnotationMarkerProjection[] {
  return browserAnnotationSession.getState().domRecords.flatMap((record) => {
    if (!isDesignReviewFeedbackRecord(record) || record.markerNumber === undefined) return [];
    const target = browserAnnotationSession.getLiveTarget(record.annotationId);
    return target ? [{ record, target }] : [];
  });
}

export function BrowserAnnotationMarkers(props: {
  interactive?: boolean;
  onOpenRecord?: (annotationId: number) => boolean;
  showChrome?: boolean;
}) {
  const markerLayerRef = usePassiveContentChromeRef<HTMLDivElement>();
  const [offsets, setOffsets] = useState<ReadonlyMap<number, AnnotationMarkerOffset>>(
    () => new Map()
  );
  const revision = useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
  const projections = useMemo(() => createMarkerProjections(revision), [revision]);
  const positions = useMarkerPositions(projections, offsets);

  useEffect(() => {
    const liveIds = new Set(projections.map(({ record }) => record.annotationId));
    setOffsets((current) => {
      const next = new Map([...current].filter(([annotationId]) => liveIds.has(annotationId)));
      return next.size === current.size ? current : next;
    });
  }, [projections]);

  return (
    <div
      className="sniptale-annotation-marker-layer pointer-events-none fixed inset-0 z-[2147483646]"
      data-ui="content.annotation-markers"
      ref={markerLayerRef}
    >
      {projections.map((projection) => (
        <AnnotationMarker
          key={projection.record.annotationId}
          {...projection}
          interactive={props.interactive ?? false}
          showChrome={props.showChrome ?? true}
          offset={offsets.get(projection.record.annotationId) ?? ZERO_OFFSET}
          onOffsetChange={(offset) =>
            setOffsets((current) => new Map(current).set(projection.record.annotationId, offset))
          }
          position={positions.get(projection.record.annotationId)}
          {...(props.onOpenRecord ? { onOpenRecord: props.onOpenRecord } : {})}
        />
      ))}
    </div>
  );
}
