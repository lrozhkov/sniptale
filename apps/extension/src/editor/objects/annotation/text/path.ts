import type { EditorTextCalloutFormat } from '../../../../features/editor/document/text';
import type { TextCalloutFrame } from './frame';
import { getTextCalloutTailMetrics } from './geometry';
import { getRoundedCalloutPath } from './rounded';
import { traceRoundedCalloutPath as traceRoundedCalloutCanvasPath } from './rounded-trace';

type PathTraceContext = Pick<
  CanvasRenderingContext2D,
  'arcTo' | 'beginPath' | 'closePath' | 'lineTo' | 'moveTo'
>;

const DEFAULT_FRAME: TextCalloutFrame = {
  height: 60,
  left: 0,
  top: 0,
  width: 100,
};

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function resolveFrame(frame?: TextCalloutFrame): TextCalloutFrame {
  return frame ?? DEFAULT_FRAME;
}

function buildPointerPathData(frame: TextCalloutFrame): string {
  const left = frame.left;
  const top = frame.top;
  const right = left + frame.width;
  const bottom = top + frame.height;
  const tailWidth = getTextCalloutTailMetrics(frame, 'pointer').width ?? 1;
  const cornerX = left + tailWidth;
  const tailTop = top + frame.height / 2;
  return [
    `M ${formatNumber(cornerX)} ${formatNumber(top)}`,
    `H ${formatNumber(right)}`,
    `V ${formatNumber(bottom)}`,
    `H ${formatNumber(cornerX)}`,
    `L ${formatNumber(left)} ${formatNumber(bottom)}`,
    `L ${formatNumber(cornerX)} ${formatNumber(tailTop)}`,
    `V ${formatNumber(top)}`,
    `Q ${formatNumber(cornerX)} ${formatNumber(top)} ${formatNumber(cornerX)} ${formatNumber(top)}`,
    'Z',
  ].join(' ');
}

function buildFlagPathData(frame: TextCalloutFrame): string {
  const left = frame.left;
  const top = frame.top;
  const right = left + frame.width;
  const bottom = top + frame.height;
  const notchWidth = getTextCalloutTailMetrics(frame, 'flag').notchWidth ?? 1;
  const notchX = right - notchWidth;
  const middleY = top + frame.height / 2;
  return [
    `M ${formatNumber(left)} ${formatNumber(top)}`,
    `H ${formatNumber(right)}`,
    `L ${formatNumber(notchX)} ${formatNumber(middleY)}`,
    `L ${formatNumber(right)} ${formatNumber(bottom)}`,
    `H ${formatNumber(left)}`,
    'Z',
  ].join(' ');
}

export function getTextCalloutPath(
  format: EditorTextCalloutFormat,
  frame?: TextCalloutFrame
): string | null {
  const resolvedFrame = resolveFrame(frame);
  switch (format) {
    case 'panel':
      return getRoundedCalloutPath(format, resolvedFrame);
    case 'bubble':
    case 'arrow-bubble':
      return getRoundedCalloutPath(format, resolvedFrame);
    case 'pointer':
      return buildPointerPathData(resolvedFrame);
    case 'flag':
      return buildFlagPathData(resolvedFrame);
    case 'plain':
      return null;
  }
}

export function traceTextCalloutPath(
  ctx: PathTraceContext,
  format: EditorTextCalloutFormat,
  frame: TextCalloutFrame
): boolean {
  switch (format) {
    case 'panel':
    case 'bubble':
    case 'arrow-bubble':
      traceRoundedCalloutCanvasPath(ctx, format, frame);
      return true;
    case 'pointer':
    case 'flag':
      return false;
    case 'plain':
      return false;
  }
}
