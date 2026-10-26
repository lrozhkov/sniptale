import { useCallback, useEffect, useRef, useState } from 'react';
import { Move, ScanSearch } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import {
  getAbsolutePosition,
  addWindowEventListenerToAllWindowsDynamic,
} from '../../../platform/frame';
import { useContentUiScale } from '../../../platform/dom-host';
import { setDesignReviewTool } from '../../../selection/design-review';
import { bindDesignReviewElementMove } from '../../../selection/design-review/move';
import { readDesignReviewMoveCoordinates } from '../../../selection/design-review/move-coordinates';
import { showDesignReviewFrame } from '../../../selection/design-review/frame';
import { readPixelTranslation } from '../settings/tools-model';
import type { DesignReviewActions, DesignReviewViewState } from '../types';

/** The Move input owner stays active independently of the inspector workspace. */
interface MoveSurfaceProps {
  enabled: boolean;
  actions: DesignReviewActions;
  state: DesignReviewViewState;
}

function useElementMove(props: MoveSurfaceProps) {
  const target = props.state.selection?.element ?? null;
  const handle = useRef<HTMLButtonElement>(null);
  const readPosition = useCallback(
    () =>
      target?.isConnected
        ? readPixelTranslation(
            target.ownerDocument.defaultView?.getComputedStyle(target).translate ?? 'none'
          )
        : null,
    [target]
  );
  const [position, setPosition] = useState(readPosition);
  const [error, setError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const toolsRef = useRef(props.actions.tools);
  toolsRef.current = props.actions.tools;
  const finish = props.actions.tools?.finish;
  const register = props.actions.tools?.registerGestureCancel;
  const failure = useCallback(() => {
    setError(true);
    setPosition(readPosition());
  }, [readPosition]);
  useEffect(() => {
    setPosition(readPosition());
    setError(false);
  }, [readPosition, props.state.values.translate]);
  useEffect(() => {
    if (!props.enabled || !target || !handle.current || !finish || !register) return;
    const tools = toolsRef.current;
    if (!tools) return;
    const mover = bindDesignReviewElementMove({
      target,
      handle: handle.current,
      readPosition,
      finish,
      apply: (value, deferred) => tools.apply([{ property: 'translate', ...value }], deferred),
      onPosition: (value) => {
        setPosition(value);
        setError(false);
        if (target.isConnected) showDesignReviewFrame(target, true, true);
      },
      onError: failure,
      onGestureChange: setDragging,
    });
    const unregister = register(mover.cancel);
    return () => {
      mover.dispose();
      unregister();
    };
  }, [props.enabled, target, readPosition, finish, register, failure]);
  return {
    target,
    handle,
    position,
    error,
    dragging,
    finish,
    failure,
    readPosition,
    setPosition,
    setError,
  };
}

function useMoveGeometryRevision(enabled: boolean, target: Element | null) {
  const [geometryRevision, setGeometryRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !target) return;
    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setGeometryRevision((value) => value + 1);
        });
    };
    const scroll = addWindowEventListenerToAllWindowsDynamic('scroll', schedule, { capture: true });
    const resize = addWindowEventListenerToAllWindowsDynamic('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(target);
    return () => {
      scroll();
      resize();
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, target]);
  return geometryRevision;
}

export function DesignReviewMoveSurface(props: MoveSurfaceProps) {
  const {
    target,
    handle,
    position,
    error,
    dragging,
    finish,
    failure,
    readPosition,
    setPosition,
    setError,
  } = useElementMove(props);
  const uiScale = useContentUiScale();
  const geometryRevision = useMoveGeometryRevision(props.enabled, target);
  if (!props.enabled || !target) return null;
  const coordinates = readDesignReviewMoveCoordinates(target);
  const supported = Boolean(position && coordinates);
  const { left, top, width } = placeMoveControls(target, uiScale);
  return (
    <div
      role="group"
      aria-label={translate('content.designReview.toolMove')}
      data-ui="content.design-review.move-hud"
      data-floating-ui-capture-transient="true"
      data-geometry-revision={geometryRevision}
      className={[
        'sniptale-design-review-chrome sniptale-compact-workspace pointer-events-auto fixed z-[2147483646]',
        'flex items-center gap-2 rounded bg-[var(--sniptale-color-surface-panel)] px-2 py-1 shadow-lg',
      ].join(' ')}
      style={{
        left,
        top,
        maxWidth: width,
        backgroundColor: 'rgb(from var(--sniptale-color-surface-panel) r g b / 1)',
      }}
    >
      <ContentToolbarButton
        ref={handle}
        tone="utility"
        dataUi="content.design-review.move-element"
        className="!size-7 !min-h-7 !min-w-7 !p-0 touch-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        disabled={!supported}
        aria-label={translate('content.designReview.freeMove')}
        title={translate('content.designReview.moveHint')}
        data-sniptale-activation-bridge="off"
        onKeyDown={(event) =>
          nudgeElement(event, {
            position,
            supported,
            actions: props.actions,
            target,
            readPosition,
            setPosition,
            setError,
            failure,
          })
        }
        onBlur={() => finish?.()}
      >
        <Move size={16} />
      </ContentToolbarButton>
      <MoveStatus
        error={error}
        supported={supported}
        position={position}
        coordinatesSupported={Boolean(coordinates)}
      />
      <ContentToolbarButton
        tone="utility"
        className="!size-7 !min-h-7 !min-w-7 !p-0 shrink-0"
        aria-label={translate('content.designReview.toolInspect')}
        title={translate('content.designReview.toolInspect')}
        onClick={() => setDesignReviewTool('inspect')}
      >
        <ScanSearch size={15} />
      </ContentToolbarButton>
    </div>
  );
}

function nudgeElement(
  event: import('react').KeyboardEvent<HTMLButtonElement>,
  args: {
    position: { x: number; y: number } | null;
    supported: boolean;
    actions: DesignReviewActions;
    target: Element;
    readPosition(): { x: number; y: number } | null;
    setPosition(value: { x: number; y: number }): void;
    setError(value: boolean): void;
    failure(): void;
  }
) {
  if (
    event.nativeEvent.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !args.position ||
    !args.supported
  )
    return;
  const step = event.shiftKey ? 10 : 1;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const offset = delta[event.key];
  if (!offset || !args.actions.tools) return;
  event.preventDefault();
  event.stopPropagation();
  const current = args.readPosition();
  if (!current) return;
  const next = { x: current.x + offset[0], y: current.y + offset[1] };
  void args.actions.tools
    .apply([{ property: 'translate', value: `${next.x}px ${next.y}px` }])
    .then(() => {
      args.setPosition(next);
      args.setError(false);
      showDesignReviewFrame(args.target, true, true);
    })
    .catch(args.failure);
}

function placeMoveControls(target: Element, uiScale: number) {
  const rect = getAbsolutePosition(target);
  const width = Math.min(300 * uiScale, window.innerWidth - 24);
  const height = 40 * uiScale;
  const below = rect.y + rect.height + 8;
  const above = rect.y - height - 28;
  const top = below + height <= window.innerHeight - 12 ? Math.max(72, below) : Math.max(72, above);
  const left = Math.max(12, Math.min(rect.x, window.innerWidth - width - 12));
  return { left, top, width };
}

function MoveStatus({
  error,
  supported,
  position,
  coordinatesSupported,
}: {
  error: boolean;
  supported: boolean;
  position: { x: number; y: number } | null;
  coordinatesSupported: boolean;
}) {
  return (
    <div className="min-w-0 text-xs tabular-nums" role={error ? 'alert' : undefined}>
      {error ? (
        translate('content.designReview.toolApplyError')
      ) : supported && position ? (
        <span className="whitespace-nowrap">
          {`X ${position.x} · Y ${position.y}`} {translate('content.callout.unitPxSuffix')}
        </span>
      ) : (
        translate(
          coordinatesSupported
            ? 'content.designReview.moveUnsupported'
            : 'content.designReview.moveGeometryUnsupported'
        )
      )}
    </div>
  );
}
