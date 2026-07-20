export function buildScenarioLightboxStyles(): string[] {
  return [
    '.lightbox{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:8px;',
    'background:rgba(19,16,12,.74);backdrop-filter:blur(12px);}',
    '.lightbox[hidden]{display:none;}',
    '.lightbox-backdrop{position:absolute;inset:0;display:block;padding:0;border:0;background:none;}',
    '.lightbox-shell{position:relative;z-index:1;width:min(1520px,calc(100vw - 16px));',
    'height:min(1040px,calc(100vh - 16px));display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;',
    'padding:12px 12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:24px;',
    'background:rgba(27,22,17,.94);box-shadow:var(--shadow-strong);}',
    '.lightbox-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#f8ecde;}',
    '.lightbox-title{font-size:15px;font-weight:600;letter-spacing:-.01em;}',
    '.lightbox-close{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;',
    'padding:0;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.04);',
    'color:#fff7ec;font-size:20px;cursor:pointer;text-decoration:none;}',
    '.lightbox-frame{overflow:hidden;min-height:0;border-radius:18px;background:radial-gradient(circle at top,',
    'rgba(188,117,64,.08),transparent 30%),#18130f;}',
    '.lightbox-stage{display:grid;place-items:center;height:100%;padding:10px;}',
    '.lightbox-image{display:block;max-width:100%;max-height:100%;width:auto;height:auto;',
    'border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#f1e6d3;}',
  ];
}

export function buildScenarioResponsiveStyles(): string[] {
  return [
    '@media (max-width:820px){.page{width:calc(100vw - 20px);margin:10px auto;padding:20px 18px 28px;',
    'border-radius:24px;}.step-header{align-items:center;}.step-index{min-width:40px;height:30px;padding:0 12px;}',
    '.capture-media{padding:6px;border-radius:20px;}.capture-preview{border-radius:16px;}',
    '.capture-action{right:12px;bottom:12px;}.lightbox{padding:4px;}.lightbox-shell{width:calc(100vw - 8px);',
    'height:calc(100vh - 8px);padding:10px;}}',
  ];
}
