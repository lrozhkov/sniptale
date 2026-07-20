import type { PointLike } from '../../types';
import { resolveCornerRadius, resolveRoundedEntry, type RoundedCornerOptions } from './corners';
import { formatPathNumber } from './format';

export function buildRoundedClosedPath(
  points: readonly PointLike[],
  options: RoundedCornerOptions
): string {
  const count = points.length;
  if (count < 3) {
    return '';
  }

  const start = resolveRoundedEntry(points, resolveCornerRadius(options, 0), 0);
  if (!start) {
    return '';
  }

  const commands = [
    `M ${formatPathNumber(start.outgoing.x)} ${formatPathNumber(start.outgoing.y)}`,
  ];
  for (let index = 1; index < count; index += 1) {
    const entry = resolveRoundedEntry(points, resolveCornerRadius(options, index), index);
    if (!entry) {
      continue;
    }

    commands.push(`L ${formatPathNumber(entry.incoming.x)} ${formatPathNumber(entry.incoming.y)}`);
    if (entry.radius !== null) {
      commands.push(
        [
          `Q ${formatPathNumber(entry.point.x)} ${formatPathNumber(entry.point.y)}`,
          `${formatPathNumber(entry.outgoing.x)} ${formatPathNumber(entry.outgoing.y)}`,
        ].join(' ')
      );
    }
  }

  commands.push(`L ${formatPathNumber(start.incoming.x)} ${formatPathNumber(start.incoming.y)}`);
  commands.push('Z');
  return commands.join(' ');
}
