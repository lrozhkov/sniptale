export function renderScenarioDeckHtmlStyles(): string {
  return [
    ':root{color-scheme:light dark;font-family:Inter,Arial,sans-serif;background:#111;color:#f8f5ef}',
    'body{margin:0;background:#111;color:#f8f5ef}',
    '.deck{display:grid;gap:40px;padding:40px;max-width:1440px;margin:0 auto}',
    '.slide{display:grid;gap:14px}',
    '.slide-frame{overflow:auto;border:1px solid rgba(255,255,255,.14);background:#181512}',
    '.slide-frame svg{display:block;max-width:100%;height:auto}',
    '.slide-title{margin:0;font-size:18px;font-weight:650;color:#fff}',
    '.notes{white-space:pre-wrap;color:#c8beb2;font-size:14px;line-height:1.5}',
    '.missing{color:#e9b872;font-size:13px}',
  ].join('');
}
