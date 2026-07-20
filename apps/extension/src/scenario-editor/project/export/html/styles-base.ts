export function buildScenarioHtmlBaseStyles(): string[] {
  return [
    ':root{color-scheme:light;--canvas:#f4ede3;--paper:rgba(252,249,244,.94);--text:#231b12;',
    '--text-soft:#665849;--text-muted:#8b7a69;--editorial:#93612f;--info-bg:rgba(73,114,150,.08);',
    '--warning-bg:rgba(180,122,43,.10);--error-bg:rgba(167,74,67,.10);--shadow-soft:0 18px 42px rgba(53,35,19,.07);',
    '--shadow-strong:0 28px 80px rgba(28,20,10,.22);}',
    '*{box-sizing:border-box;}',
    'body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(193,112,56,.18),',
    'transparent 34%),radial-gradient(circle at top right,rgba(102,127,159,.12),transparent 28%),',
    'linear-gradient(180deg,#f7f1e8 0%,var(--canvas) 100%);color:var(--text);font-family:"Segoe UI","Aptos",',
    '"Helvetica Neue",ui-sans-serif,sans-serif;}',
    'body.lightbox-open{overflow:hidden;overscroll-behavior:none;}',
    '.page{width:min(1120px,calc(100vw - 32px));margin:28px auto;padding:32px 28px 36px;border-radius:32px;',
    'background:var(--paper);box-shadow:var(--shadow-soft);backdrop-filter:blur(18px);}',
    '.export-header{display:grid;gap:8px;padding:4px 0 24px;}',
    'h1{margin:0;font-size:clamp(42px,6vw,72px);line-height:.94;letter-spacing:-.04em;text-wrap:balance;}',
    '.export-document{display:grid;gap:22px;padding-top:12px;}',
  ];
}
