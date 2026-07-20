import { Minus, Move, Pencil, Plus, RotateCcw } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioCanvasElementPatch, ScenarioCanvasImageContentSession } from './types';

export function createImageContentPanPatch(args: {
  originClientX: number;
  originClientY: number;
  scale: number;
  snapshot: { scale: number; x: number; y: number };
  targetClientX: number;
  targetClientY: number;
}): ScenarioCanvasElementPatch {
  const scale = args.scale || 1;
  return {
    contentTransform: {
      ...args.snapshot,
      x: args.snapshot.x + (args.targetClientX - args.originClientX) / scale,
      y: args.snapshot.y + (args.targetClientY - args.originClientY) / scale,
    },
  };
}

export function createImageContentZoomPatch(args: {
  direction: 'in' | 'out' | 'reset';
  snapshot: { scale: number; x: number; y: number };
}): ScenarioCanvasElementPatch {
  if (args.direction === 'reset') {
    return { contentTransform: { scale: 1, x: 0, y: 0 } };
  }

  const delta = args.direction === 'in' ? 0.1 : -0.1;
  return {
    contentTransform: {
      ...args.snapshot,
      scale: Math.max(0.1, Number((args.snapshot.scale + delta).toFixed(2))),
    },
  };
}

function ImageContentButton(props: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick?.();
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]
        bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]
        shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:text-[var(--sniptale-color-text-primary)]"
    >
      {props.children}
    </button>
  );
}

export function ScenarioCanvasImageContentControls(props: {
  renderedElement: ScenarioRenderedElement | null;
  onEditImageElement?: (elementId: string) => void;
  onImageContentPanStart: (session: ScenarioCanvasImageContentSession, event: PointerEvent) => void;
  onUpdateElement: (elementId: string, patch: ScenarioCanvasElementPatch) => void;
  viewportScale: number;
}) {
  const rendered = props.renderedElement;
  if (!rendered || rendered.element.locked || rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.image) {
    return null;
  }

  return (
    <ImageContentControlBar
      rendered={rendered}
      {...(props.onEditImageElement ? { onEditImageElement: props.onEditImageElement } : {})}
      onImageContentPanStart={props.onImageContentPanStart}
      onUpdateElement={props.onUpdateElement}
      viewportScale={props.viewportScale}
    />
  );
}

function ImageContentControlBar(props: {
  rendered: Extract<ScenarioRenderedElement, { kind: 'image' }>;
  onEditImageElement?: (elementId: string) => void;
  onImageContentPanStart: (session: ScenarioCanvasImageContentSession, event: PointerEvent) => void;
  onUpdateElement: (elementId: string, patch: ScenarioCanvasElementPatch) => void;
  viewportScale: number;
}) {
  const { rendered } = props;

  return (
    <div
      data-ui="scenario.canvas.image-content-controls"
      className="absolute z-30 flex items-center gap-1"
      style={{
        left: rendered.box.x + 8,
        top: rendered.box.y + 8,
        transform: `scale(${1 / props.viewportScale})`,
        transformOrigin: 'top left',
      }}
    >
      <ImageContentPanButton rendered={rendered} onPanStart={props.onImageContentPanStart} />
      <ImageContentZoomButton direction="in" icon={<Plus className="h-4 w-4" />} {...props} />
      <ImageContentZoomButton direction="out" icon={<Minus className="h-4 w-4" />} {...props} />
      <ImageContentEditButton rendered={rendered} onEditImageElement={props.onEditImageElement} />
      <ImageContentZoomButton
        direction="reset"
        icon={<RotateCcw className="h-4 w-4" />}
        {...props}
      />
    </div>
  );
}

function ImageContentEditButton(props: {
  rendered: Extract<ScenarioRenderedElement, { kind: 'image' }>;
  onEditImageElement: ((elementId: string) => void) | undefined;
}) {
  if (!props.onEditImageElement) {
    return null;
  }

  return (
    <ImageContentButton
      label={translate('scenario.editor.editImage')}
      onClick={() => props.onEditImageElement?.(props.rendered.element.id)}
    >
      <Pencil className="h-4 w-4" />
    </ImageContentButton>
  );
}

function ImageContentPanButton(props: {
  rendered: Extract<ScenarioRenderedElement, { kind: 'image' }>;
  onPanStart: (session: ScenarioCanvasImageContentSession, event: PointerEvent) => void;
}) {
  return (
    <ImageContentButton label={translate('scenario.editor.panImageContent')}>
      <span
        onPointerDown={(event) => {
          event.stopPropagation();
          props.onPanStart(createImageContentSession(props.rendered, event), event);
        }}
        className="inline-flex h-full w-full items-center justify-center"
      >
        <Move className="h-4 w-4" />
      </span>
    </ImageContentButton>
  );
}

function ImageContentZoomButton(props: {
  direction: 'in' | 'out' | 'reset';
  icon: ReactNode;
  rendered: Extract<ScenarioRenderedElement, { kind: 'image' }>;
  onUpdateElement: (elementId: string, patch: ScenarioCanvasElementPatch) => void;
}) {
  const label =
    props.direction === 'reset'
      ? translate('scenario.editor.resetImageContent')
      : translate(
          props.direction === 'in'
            ? 'scenario.editor.zoomImageContentIn'
            : 'scenario.editor.zoomImageContentOut'
        );

  return (
    <ImageContentButton
      label={label}
      onClick={() =>
        props.onUpdateElement(
          props.rendered.element.id,
          createImageContentZoomPatch({
            direction: props.direction,
            snapshot: props.rendered.element.contentTransform,
          })
        )
      }
    >
      {props.icon}
    </ImageContentButton>
  );
}

function createImageContentSession(
  rendered: Extract<ScenarioRenderedElement, { kind: 'image' }>,
  event: PointerEvent
): ScenarioCanvasImageContentSession {
  return {
    contentTransform: rendered.element.contentTransform,
    element: rendered.element,
    originClientX: event.clientX,
    originClientY: event.clientY,
  };
}
