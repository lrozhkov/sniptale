import type { CalloutAccentSide } from '@sniptale/runtime-contracts/highlighter/callout';

type AccentRect = { x: number; y: number; width: number; height: number };

function round(value: number) {
  return Number(value.toFixed(2));
}

export function getCalloutAccentEdgePath(args: { rect: AccentRect; side: CalloutAccentSide }) {
  const left = round(args.rect.x);
  const top = round(args.rect.y);
  const right = round(args.rect.x + args.rect.width);
  const bottom = round(args.rect.y + args.rect.height);
  if (args.side === 'top') return `M ${left} ${top} H ${right}`;
  if (args.side === 'right') return `M ${right} ${top} V ${bottom}`;
  if (args.side === 'bottom') return `M ${right} ${bottom} H ${left}`;
  return `M ${left} ${bottom} V ${top}`;
}
