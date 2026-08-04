import type { CalloutLineStyle } from '@sniptale/runtime-contracts/highlighter/callout';

export function getCalloutStrokeDasharray(
  lineStyle: CalloutLineStyle,
  width: number
): string | undefined {
  const scale = Math.max(1, width);
  if (lineStyle === 'dashed') return `${scale * 4} ${scale * 2.5}`;
  if (lineStyle === 'dotted') return `0 ${scale * 2.5}`;
  return undefined;
}
