import type React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveContentShadowRoot } from '../../../platform/dom-host';

type Point = { x: number; y: number };

const calloutCenters = new WeakMap<React.MutableRefObject<FrameData>, Point>();

export function captureResizeCalloutCenter(
  startFrameRef: React.MutableRefObject<FrameData>,
  frameId: string
) {
  const shadowRoot = resolveContentShadowRoot();
  const roots: ParentNode[] = shadowRoot ? [shadowRoot, document] : [document];
  const callout = roots
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('.sniptale-callout')))
    .find((element) => element.dataset['frameId'] === frameId);
  const rect = callout?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    calloutCenters.delete(startFrameRef);
    return;
  }
  calloutCenters.set(startFrameRef, {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });
}

export function getResizeCalloutCenter(
  startFrameRef: React.MutableRefObject<FrameData>
): Point | null {
  return calloutCenters.get(startFrameRef) ?? null;
}

export function clearResizeCalloutCenter(startFrameRef: React.MutableRefObject<FrameData>) {
  calloutCenters.delete(startFrameRef);
}
