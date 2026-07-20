export function slugifyDeckExportName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'scenario'
  );
}

export function escapeDeckHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeDeckMarkdown(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\]/g, '\\]')
    .replace(/\[/g, '\\[');
}

export function fenceDeckCode(value: string): string {
  const longestFence = Math.max(...(value.match(/`+/g) ?? ['```']).map((item) => item.length));
  const fence = '`'.repeat(Math.max(3, longestFence + 1));
  return `${fence}\n${value}\n${fence}`;
}

export function createTextBlob(value: string, type: string): Blob {
  return new Blob([value], { type });
}
