export function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value);
}
