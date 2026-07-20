export function escapeSvgText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replaceAll('"', '&quot;');
}
