import type { TextCalloutFrame } from './frame';
import {
  type ArrowBubbleLayout,
  type BubbleLayout,
  formatNumber,
  PANEL_RADIUS_RATIO,
  resolveBubbleLayoutForFrame,
  resolveClampedRadius,
} from './rounded-layout';

function buildRoundedRectPathData(frame: TextCalloutFrame, radius: number): string {
  const left = frame.left;
  const top = frame.top;
  const right = left + frame.width;
  const bottom = top + frame.height;
  return [
    `M ${formatNumber(left + radius)} ${formatNumber(top)}`,
    `H ${formatNumber(right - radius)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(right)} ${formatNumber(
      top + radius
    )}`,
    `V ${formatNumber(bottom - radius)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(
      right - radius
    )} ${formatNumber(bottom)}`,
    `H ${formatNumber(left + radius)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(left)} ${formatNumber(
      bottom - radius
    )}`,
    `V ${formatNumber(top + radius)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(left + radius)} ${formatNumber(
      top
    )}`,
    'Z',
  ].join(' ');
}

function buildBubblePathData(layout: BubbleLayout): string {
  const tailCommands = [
    `L ${formatNumber(layout.centerX)} ${formatNumber(layout.bottom)}`,
    `L ${formatNumber(layout.centerX - layout.tailHalfWidth)} ${formatNumber(layout.bodyBottom)}`,
  ];
  return buildBubblePathDataWithTail(layout, tailCommands);
}

function buildArrowBubblePathData(layout: ArrowBubbleLayout): string {
  const tailCommands = [
    `L ${formatNumber(layout.centerX + layout.tailHalfWidth)} ${formatNumber(layout.shoulderY)}`,
    `L ${formatNumber(layout.centerX)} ${formatNumber(layout.bottom)}`,
    `L ${formatNumber(layout.centerX - layout.tailHalfWidth)} ${formatNumber(layout.shoulderY)}`,
    `L ${formatNumber(layout.centerX - layout.tailHalfWidth)} ${formatNumber(layout.bodyBottom)}`,
  ];
  return buildBubblePathDataWithTail(layout, tailCommands);
}

function buildBubblePathDataWithTail(layout: BubbleLayout, tailCommands: string[]): string {
  return [
    `M ${formatNumber(layout.left + layout.radius)} ${formatNumber(layout.top)}`,
    `H ${formatNumber(layout.right - layout.radius)}`,
    `A ${formatNumber(layout.radius)} ${formatNumber(layout.radius)} 0 0 1 ${formatNumber(
      layout.right
    )} ${formatNumber(layout.top + layout.radius)}`,
    `V ${formatNumber(layout.bodyBottom - layout.radius)}`,
    `A ${formatNumber(layout.radius)} ${formatNumber(layout.radius)} 0 0 1 ${formatNumber(
      layout.right - layout.radius
    )} ${formatNumber(layout.bodyBottom)}`,
    `H ${formatNumber(layout.centerX + layout.tailHalfWidth)}`,
    ...tailCommands,
    `H ${formatNumber(layout.left + layout.radius)}`,
    `A ${formatNumber(layout.radius)} ${formatNumber(layout.radius)} 0 0 1 ${formatNumber(
      layout.left
    )} ${formatNumber(layout.bodyBottom - layout.radius)}`,
    `V ${formatNumber(layout.top + layout.radius)}`,
    `A ${formatNumber(layout.radius)} ${formatNumber(layout.radius)} 0 0 1 ${formatNumber(
      layout.left + layout.radius
    )} ${formatNumber(layout.top)}`,
    'Z',
  ].join(' ');
}

export function getRoundedCalloutPath(
  format: 'arrow-bubble' | 'bubble' | 'panel',
  frame: TextCalloutFrame
): string {
  switch (format) {
    case 'panel':
      return buildRoundedRectPathData(
        frame,
        resolveClampedRadius(PANEL_RADIUS_RATIO, frame.width, frame.height)
      );
    case 'bubble':
      return buildBubblePathData(resolveBubbleLayoutForFrame(frame, 'bubble'));
    case 'arrow-bubble':
      return buildArrowBubblePathData(
        resolveBubbleLayoutForFrame(frame, 'arrow-bubble') as ArrowBubbleLayout
      );
  }
}
