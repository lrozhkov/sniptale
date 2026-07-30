import { MessageSquare } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { translate } from '../../../platform/i18n';
import { registerContentOwnedPassiveChrome } from '../../platform/dom-host';
import {
  browserAnnotationSession,
  type BrowserDomAnnotationRecord,
} from '../../parser/page-preparation/annotations';
import { getAbsolutePosition } from '../../platform/frame';

interface AnnotationMarkerProjection {
  record: BrowserDomAnnotationRecord;
  target: Element;
}

interface AnnotationMarkerPosition {
  compactTooltip: boolean;
  markerLeft: number | null;
  markerRight: number | null;
  markerTop: number;
  tooltipBottom: number | null;
  tooltipLeft: number | null;
  tooltipMaxHeight: number;
  tooltipMaxWidth: number;
  tooltipRight: number | null;
  tooltipCorridor: 'above' | 'below' | 'none';
  tooltipTop: number | null;
}

function usePassiveContentChromeRef<T extends Element>() {
  const cleanupRef = useRef<() => void>(() => undefined);
  const ref = useCallback((element: T | null) => {
    cleanupRef.current();
    cleanupRef.current = registerContentOwnedPassiveChrome(element);
  }, []);

  useLayoutEffect(() => () => cleanupRef.current(), []);
  return ref;
}

function markerPositionsMatch(
  left: ReadonlyMap<number, AnnotationMarkerPosition>,
  right: ReadonlyMap<number, AnnotationMarkerPosition>
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [annotationId, leftPosition] of left) {
    const rightPosition = right.get(annotationId);
    if (
      !rightPosition ||
      leftPosition.compactTooltip !== rightPosition.compactTooltip ||
      leftPosition.markerLeft !== rightPosition.markerLeft ||
      leftPosition.markerRight !== rightPosition.markerRight ||
      leftPosition.markerTop !== rightPosition.markerTop ||
      leftPosition.tooltipBottom !== rightPosition.tooltipBottom ||
      leftPosition.tooltipLeft !== rightPosition.tooltipLeft ||
      leftPosition.tooltipMaxHeight !== rightPosition.tooltipMaxHeight ||
      leftPosition.tooltipMaxWidth !== rightPosition.tooltipMaxWidth ||
      leftPosition.tooltipRight !== rightPosition.tooltipRight ||
      leftPosition.tooltipCorridor !== rightPosition.tooltipCorridor ||
      leftPosition.tooltipTop !== rightPosition.tooltipTop
    ) {
      return false;
    }
  }
  return true;
}

function useMarkerPositions(
  projections: AnnotationMarkerProjection[]
): ReadonlyMap<number, AnnotationMarkerPosition> {
  const [positions, setPositions] = useState<ReadonlyMap<number, AnnotationMarkerPosition>>(
    () => new Map()
  );

  useLayoutEffect(() => {
    if (projections.length === 0) {
      setPositions((current) => (current.size === 0 ? current : new Map()));
      return;
    }

    let active = true;
    let animationFrame = 0;
    let lastPositions: ReadonlyMap<number, AnnotationMarkerPosition> = new Map();

    function samplePositions() {
      const nextPositions = new Map<number, AnnotationMarkerPosition>();
      projections.forEach(({ record, target }) => {
        const position = resolveMarkerPosition(target);
        if (position) {
          nextPositions.set(record.annotationId, position);
        }
      });
      if (!markerPositionsMatch(lastPositions, nextPositions)) {
        lastPositions = nextPositions;
        setPositions((current) =>
          markerPositionsMatch(current, nextPositions) ? current : nextPositions
        );
      }
      if (active) {
        animationFrame = window.requestAnimationFrame(samplePositions);
      }
    }

    samplePositions();

    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [projections]);

  return positions;
}

function resolveMarkerPosition(target: Element): AnnotationMarkerPosition | null {
  try {
    if (!target.isConnected || target.getClientRects().length === 0) {
      return null;
    }
    const rect = getAbsolutePosition(target);
    if (![rect.height, rect.width, rect.x, rect.y].every(Number.isFinite)) {
      return null;
    }

    const viewportWidth = Math.max(0, window.innerWidth);
    const viewportHeight = Math.max(0, window.innerHeight);
    const anchorX = Math.max(4, Math.min(viewportWidth - 4, rect.x + rect.width - 12));
    const markerTop = Math.max(4, Math.min(viewportHeight - 36, rect.y - 12));
    const markerOnLeft = anchorX <= viewportWidth / 2;
    const markerLeft = markerOnLeft ? anchorX : null;
    const markerRight = markerOnLeft ? null : Math.max(4, viewportWidth - anchorX);

    const horizontalSpace = Math.max(0, markerOnLeft ? viewportWidth - 4 - anchorX : anchorX - 4);
    let tooltipLeft = markerOnLeft ? anchorX : null;
    let tooltipRight = markerOnLeft ? null : Math.max(4, viewportWidth - anchorX);
    let tooltipMaxWidth = Math.floor(Math.min(288, horizontalSpace));
    let compactTooltip = false;
    if (tooltipMaxWidth < 22) {
      compactTooltip = true;
      tooltipLeft = 4;
      tooltipRight = null;
      tooltipMaxWidth = Math.floor(Math.max(0, viewportWidth - 8));
    }

    const availableAbove = Math.max(0, markerTop - 12);
    const availableBelow = Math.max(0, viewportHeight - 4 - (markerTop + 40));
    const placeBelow = availableBelow >= 160 || availableBelow >= availableAbove;
    const verticalSpace = placeBelow ? availableBelow : availableAbove;
    let tooltipTop: number | null = placeBelow ? markerTop + 40 : null;
    let tooltipBottom: number | null = placeBelow
      ? null
      : Math.max(4, viewportHeight - markerTop + 8);
    let tooltipMaxHeight = Math.floor(verticalSpace);
    let tooltipCorridor: AnnotationMarkerPosition['tooltipCorridor'] = placeBelow
      ? 'below'
      : 'above';
    if (tooltipMaxHeight < 18) {
      compactTooltip = true;
      tooltipCorridor = 'none';
      tooltipTop = 4;
      tooltipBottom = null;
      tooltipMaxHeight = Math.floor(Math.max(0, viewportHeight - 8));
    }

    return {
      compactTooltip,
      markerLeft,
      markerRight,
      markerTop,
      tooltipBottom,
      tooltipLeft,
      tooltipMaxHeight,
      tooltipMaxWidth,
      tooltipRight,
      tooltipCorridor,
      tooltipTop,
    };
  } catch {
    return null;
  }
}

function handleTooltipScroll(
  event: ReactKeyboardEvent<HTMLElement>,
  tooltip: HTMLElement | null
): void {
  if (!tooltip) {
    return;
  }
  const page = Math.max(24, tooltip.clientHeight - 16);
  const commands: Partial<Record<string, number>> = {
    ArrowDown: 24,
    ArrowUp: -24,
    PageDown: page,
    PageUp: -page,
  };
  let nextScrollTop: number | undefined;
  if (event.key === 'Home') {
    nextScrollTop = 0;
  } else if (event.key === 'End') {
    nextScrollTop = tooltip.scrollHeight;
  } else if (commands[event.key] !== undefined) {
    nextScrollTop = tooltip.scrollTop + commands[event.key]!;
  }
  if (nextScrollTop === undefined) {
    return;
  }
  event.preventDefault();
  tooltip.scrollTop = Math.max(
    0,
    Math.min(nextScrollTop, Math.max(0, tooltip.scrollHeight - tooltip.clientHeight))
  );
}

function AnnotationMarker(
  props: AnnotationMarkerProjection & { position: AnnotationMarkerPosition | undefined }
) {
  const tooltipScrollRef = useRef<HTMLSpanElement>(null);
  const markerGroupRef = usePassiveContentChromeRef<HTMLDivElement>();
  const markerNoteRef = usePassiveContentChromeRef<HTMLSpanElement>();
  if (!props.position || !props.record.comment || props.record.commentMarker === undefined) {
    return null;
  }

  const tooltipId = `sniptale-annotation-comment-${props.record.annotationId}`;
  const markerLabel = `${translate('content.pageStyleInspector.commentMarkerLabel')} ${props.record.commentMarker}`;

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
      <span
        aria-describedby={tooltipId}
        aria-label={markerLabel}
        className={[
          'pointer-events-auto inline-flex min-w-8 cursor-help items-center justify-center gap-0.5',
          'box-border h-8 max-w-[calc(100vw-8px)] overflow-hidden rounded-full border-solid',
          'border-[color:var(--sniptale-color-surface-canvas)]',
          'bg-[var(--sniptale-color-surface-canvas)] px-1.5 text-[10px] font-bold',
          'text-[var(--sniptale-color-text-primary)] shadow-lg outline-none',
          'focus-visible:border-[color:var(--sniptale-color-accent)]',
        ].join(' ')}
        onKeyDown={(event) => handleTooltipScroll(event, tooltipScrollRef.current)}
        ref={markerNoteRef}
        role="note"
        style={{ borderWidth: 3 }}
        tabIndex={0}
      >
        <MessageSquare
          aria-hidden="true"
          className="pointer-events-none"
          size={12}
          strokeWidth={2.25}
        />
        <span className="pointer-events-none truncate">{props.record.commentMarker}</span>
      </span>
      <span
        className={[
          'pointer-events-auto invisible fixed z-[2147483647] opacity-0 transition-opacity',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible',
          'group-focus-within:opacity-100 motion-reduce:transition-none',
          ...(props.position.tooltipCorridor === 'none'
            ? []
            : [
                'before:pointer-events-auto before:absolute before:left-0 before:right-0',
                "before:h-2 before:content-['']",
                props.position.tooltipCorridor === 'below' ? 'before:-top-2' : 'before:-bottom-2',
              ]),
        ].join(' ')}
        id={tooltipId}
        role="tooltip"
        style={{
          bottom: props.position.tooltipBottom ?? undefined,
          left: props.position.tooltipLeft ?? undefined,
          right: props.position.tooltipRight ?? undefined,
          top: props.position.tooltipTop ?? undefined,
        }}
      >
        <span
          className={[
            'block box-border max-w-72 overscroll-contain overflow-y-auto',
            'whitespace-pre-wrap break-words rounded-[8px] border',
            'border-[color:var(--sniptale-color-border-soft)] shadow-xl',
            'bg-[var(--sniptale-color-surface-panel)] text-xs font-medium',
            'text-[var(--sniptale-color-text-primary)]',
            props.position.compactTooltip ? 'p-0.5' : 'px-2.5 py-2',
          ].join(' ')}
          data-ui="content.annotation-marker-tooltip-scroll"
          ref={tooltipScrollRef}
          style={{
            maxHeight: props.position.tooltipMaxHeight,
            maxWidth: props.position.tooltipMaxWidth,
          }}
        >
          {props.record.comment}
        </span>
      </span>
    </div>
  );
}

function createMarkerProjections(_revision: number): AnnotationMarkerProjection[] {
  const state = browserAnnotationSession.getState();
  return state.domRecords.flatMap((record): AnnotationMarkerProjection[] => {
    if (!record.comment || record.commentMarker === undefined) {
      return [];
    }
    const target = browserAnnotationSession.getLiveTarget(record.annotationId);
    return target ? [{ record, target }] : [];
  });
}

export function BrowserAnnotationMarkers() {
  const markerLayerRef = usePassiveContentChromeRef<HTMLDivElement>();
  const revision = useSyncExternalStore(
    browserAnnotationSession.subscribe,
    () => browserAnnotationSession.getState().revision,
    () => 0
  );
  const projections = useMemo(() => createMarkerProjections(revision), [revision]);
  const positions = useMarkerPositions(projections);

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
          position={positions.get(projection.record.annotationId)}
        />
      ))}
    </div>
  );
}
