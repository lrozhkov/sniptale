import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import type { LinePoint } from './types';

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function appendRoundedCorner(
  commands: string[],
  previous: LinePoint,
  current: LinePoint,
  next: LinePoint,
  radius: number
): void {
  const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
  const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
  const cornerRadius = Math.min(radius, incomingLength * 0.35, outgoingLength * 0.35);
  if (cornerRadius <= 0) {
    commands.push(`L ${formatNumber(current.x)} ${formatNumber(current.y)}`);
    return;
  }

  const incomingRatio = cornerRadius / incomingLength;
  const outgoingRatio = cornerRadius / outgoingLength;
  const entry = {
    x: current.x + (previous.x - current.x) * incomingRatio,
    y: current.y + (previous.y - current.y) * incomingRatio,
  };
  const exit = {
    x: current.x + (next.x - current.x) * outgoingRatio,
    y: current.y + (next.y - current.y) * outgoingRatio,
  };

  commands.push(`L ${formatNumber(entry.x)} ${formatNumber(entry.y)}`);
  commands.push(
    `Q ${formatNumber(current.x)} ${formatNumber(current.y)} ${formatNumber(exit.x)} ${formatNumber(exit.y)}`
  );
}

export function buildLinePathData(
  points: readonly LinePoint[],
  settings: EditorLineSettings,
  closed: boolean
): string {
  const [start] = points;
  if (!start) {
    return 'M 0 0 L 0 0';
  }

  const commands = [`M ${formatNumber(start.x)} ${formatNumber(start.y)}`];
  const shouldRound = settings.corners === 'round' && points.length > 2;
  const radius = Math.max(3, settings.width * 3.2);

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1] ?? (closed ? start : null);
    if (!previous || !current) {
      continue;
    }
    if (shouldRound && next) {
      appendRoundedCorner(commands, previous, current, next, radius);
      continue;
    }
    commands.push(`L ${formatNumber(current.x)} ${formatNumber(current.y)}`);
  }

  if (closed) {
    commands.push('Z');
  }
  return commands.join(' ');
}

export function resolveLineDashArray<T extends Pick<EditorLineSettings, 'style' | 'width'>>(
  settings: T
): number[] | undefined {
  const width = Math.max(1, settings.width);
  switch (settings.style) {
    case 'dash':
      return [width * 4, width * 2.4];
    case 'dot':
      return [width, width * 2.2];
    case 'dash-dot':
      return [width * 4, width * 2, width, width * 2];
    case 'long-dash':
      return [width * 7, width * 2.8];
    case 'solid':
      return undefined;
  }
}
