// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { admitSavedScenarioHtml } from './preview-document';
import { SCENARIO_PREVIEW_MAX_BYTES } from './preview-contract';
import retainedTourRuntime from './preview-document.retained-tour.fixture.txt?raw';
import retainedMarkerTourRuntime from './preview-document.retained-marker-tour.fixture.txt?raw';
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

async function fixture(
  mode: 'guide' | 'tour',
  script = "globalThis.document.body.dataset.ready = 'true';"
) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy =
    mode === 'guide'
      ? `default-src 'none'; script-src 'sha256-${hash}'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`
      : `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; media-src data:; base-uri 'none'; form-action 'none'`;
  const data = mode === 'tour' ? '<script type="application/json" id="tour-data">{}</script>' : '';
  const html = [
    '<!doctype html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '</head><body><h1>Saved</h1>',
    data,
    `<script>${script}</script>`,
    '</body></html>',
  ].join('');
  return { hash, html, blob: new Blob([html], { type: 'text/html' }) };
}

it.each(['guide', 'tour'] as const)(
  'admits the exact saved %s Blob with only the extension-supplied fixed executable',
  async (mode) => {
    const f = await fixture(mode);
    expect(await admitSavedScenarioHtml(f.blob, mode, f.hash)).toBe(true);
    expect(await f.blob.text()).toBe(f.html);
    expect(document.body.dataset['ready']).toBeUndefined();
  }
);

it.each([
  '<script>globalThis.alert(1)</script>',
  '<img onerror="alert(1)" src="data:x">',
  '<iframe srcdoc="evil"></iframe>',
  '<base href="https://evil.test">',
  '<meta http-equiv="refresh" content="0;url=https://evil.test">',
  '<a href="java&#10;script:alert(1)">Open</a>',
])('rejects additional active content %s before mounting a file', async (extra) => {
  const f = await fixture('guide');
  expect(
    await admitSavedScenarioHtml(
      new Blob([f.html.replace('</body>', extra + '</body>')]),
      'guide',
      f.hash
    )
  ).toBe(false);
});

it('rejects changed executable bytes, archive-selected hashes and weakened CSP', async () => {
  const f = await fixture('guide');
  for (const html of [
    f.html.replace('dataset.ready', 'dataset.stolen'),
    f.html.replace("default-src 'none'", 'default-src *'),
  ])
    expect(await admitSavedScenarioHtml(new Blob([html]), 'guide', f.hash)).toBe(false);
  expect(await admitSavedScenarioHtml(f.blob, 'guide', 'A'.repeat(43) + '=')).toBe(false);
  const large = new Blob(['x']);
  Object.defineProperty(large, 'size', { value: SCENARIO_PREVIEW_MAX_BYTES + 1 });
  expect(await admitSavedScenarioHtml(large, 'guide', f.hash)).toBe(false);
});

// Frozen bundled guide runtime from 110c14f9a, before caption alignment.
const retainedGuideRuntime = `(() => {
  const dialog = globalThis.document.querySelector('[data-guide-viewer]');
  if (!(dialog instanceof globalThis.HTMLDialogElement) || typeof dialog.showModal !== 'function')
    return;
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  const zoom = dialog.querySelector('[data-zoom]');
  let trigger;
  for (const button of globalThis.document.querySelectorAll('[data-guide-open]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const source = globalThis.document.getElementById(button.dataset.guideOpen);
      if (!source) return;
      image.src = source.getAttribute('href');
      image.alt = button.dataset.alt;
      caption.textContent = button.dataset.caption;
      dialog.dataset.zoom = 'fit';
      zoom.setAttribute('aria-pressed', 'false');
      trigger = button;
      dialog.showModal();
    });
  }
  zoom.addEventListener('click', () => {
    const full = dialog.dataset.zoom !== 'full';
    dialog.dataset.zoom = full ? 'full' : 'fit';
    zoom.setAttribute('aria-pressed', String(full));
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    trigger?.focus();
  });
})();

(() => {
  const root = globalThis.document.querySelector('.guide-reading-layout');
  if (!root || root.dataset.readingMode !== 'steps') return;
  const links = [...root.querySelectorAll('[data-guide-target]')];
  const items = [...root.querySelectorAll('[data-guide-page]')];
  const pager = globalThis.document.querySelector('[data-guide-pagination]');
  if (!links.length || !pager) return;
  const previous = pager.querySelector('[data-guide-previous]');
  const next = pager.querySelector('[data-guide-next]');
  const progress = pager.querySelector('[data-guide-progress]');
  let index = 0;
  const select = (id, focus) => {
    const selected = links.findIndex((link) => link.dataset.guideTarget === id);
    if (selected < 0) return;
    index = selected;
    for (const item of items) item.hidden = item.dataset.guidePage !== id;
    for (const link of links) {
      if (link.dataset.guideTarget === id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    previous.disabled = index === 0;
    next.disabled = index === links.length - 1;
    progress.textContent = \`\${index + 1} / \${links.length}\`;
    root.querySelector('.guide-html-content').scrollTop = 0;
    if (focus) items.find((item) => !item.hidden)?.focus({ preventScroll: true });
    links[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const fromHash = () => {
    try {
      const id = decodeURIComponent(globalThis.location.hash.slice(1));
      const item = items.find((item) => item.id === id);
      return item?.dataset.guidePage;
    } catch {
      return undefined;
    }
  };
  const go = (id) => {
    select(id, true);
    globalThis.location.hash = encodeURIComponent(id);
  };
  for (const link of links)
    link.addEventListener('click', (event) => {
      event.preventDefault();
      go(link.dataset.guideTarget);
    });
  const move = (delta) => {
    const link = links[index + delta];
    if (link) go(link.dataset.guideTarget);
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  globalThis.addEventListener('hashchange', () => select(fromHash(), false));
  globalThis.document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      globalThis.document.querySelector('dialog[open]') ||
      event.target.closest('input,textarea,select,[contenteditable]')
    )
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  select(fromHash() ?? links[0].dataset.guideTarget, false);
  pager.hidden = false;
})();
`;

it('keeps a retained guide export readable without rewriting or executing it', async () => {
  const current = await fixture('guide');
  const retained = await fixture('guide', retainedGuideRuntime);
  expect(retained.hash).toBe('dzYMBa1Mh84duGVb11ECbGEj5Zso1ZXmoUwZj2Jp9fs=');
  expect(await admitSavedScenarioHtml(retained.blob, 'guide', current.hash)).toBe(true);
  expect(await retained.blob.text()).toBe(retained.html);
  expect(document.querySelector('[data-guide-viewer]')).toBeNull();

  for (const html of [
    retained.html.replace('dialog.showModal();', 'globalThis.alert(1);'),
    retained.html.replace("default-src 'none'", 'default-src *'),
    retained.html.replace('</body>', '<script>alert(1)</script></body>'),
  ])
    expect(await admitSavedScenarioHtml(new Blob([html]), 'guide', current.hash)).toBe(false);
  const unknown = await fixture('guide', retainedGuideRuntime + '\n// changed executable');
  expect(await admitSavedScenarioHtml(unknown.blob, 'guide', current.hash)).toBe(false);
  const wrongMode = await fixture('tour', retainedGuideRuntime);
  expect(await admitSavedScenarioHtml(wrongMode.blob, 'tour', current.hash)).toBe(false);
});

// Frozen bundled guide runtime from 2367c5e618, before B20 viewer controls.
const retainedCaptionGuideRuntime = `(() => {
  const dialog = globalThis.document.querySelector('[data-guide-viewer]');
  if (!(dialog instanceof globalThis.HTMLDialogElement) || typeof dialog.showModal !== 'function')
    return;
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  const zoom = dialog.querySelector('[data-zoom]');
  let trigger;
  for (const button of globalThis.document.querySelectorAll('[data-guide-open]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const source = globalThis.document.getElementById(button.dataset.guideOpen);
      if (!source) return;
      image.src = source.getAttribute('href');
      image.alt = button.dataset.alt;
      caption.textContent = button.dataset.caption;
      const alignment = button.dataset.captionAlignment;
      caption.style.textAlign = alignment === 'start' || alignment === 'end' ? alignment : 'center';
      dialog.dataset.zoom = 'fit';
      zoom.setAttribute('aria-pressed', 'false');
      trigger = button;
      dialog.showModal();
    });
  }
  zoom.addEventListener('click', () => {
    const full = dialog.dataset.zoom !== 'full';
    dialog.dataset.zoom = full ? 'full' : 'fit';
    zoom.setAttribute('aria-pressed', String(full));
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    trigger?.focus();
  });
})();

(() => {
  const root = globalThis.document.querySelector('.guide-reading-layout');
  if (!root || root.dataset.readingMode !== 'steps') return;
  const links = [...root.querySelectorAll('[data-guide-target]')];
  const items = [...root.querySelectorAll('[data-guide-page]')];
  const pager = globalThis.document.querySelector('[data-guide-pagination]');
  if (!links.length || !pager) return;
  const previous = pager.querySelector('[data-guide-previous]');
  const next = pager.querySelector('[data-guide-next]');
  const progress = pager.querySelector('[data-guide-progress]');
  let index = 0;
  const select = (id, focus) => {
    const selected = links.findIndex((link) => link.dataset.guideTarget === id);
    if (selected < 0) return;
    index = selected;
    for (const item of items) item.hidden = item.dataset.guidePage !== id;
    for (const link of links) {
      if (link.dataset.guideTarget === id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    previous.disabled = index === 0;
    next.disabled = index === links.length - 1;
    progress.textContent = \`\${index + 1} / \${links.length}\`;
    root.querySelector('.guide-html-content').scrollTop = 0;
    if (focus) items.find((item) => !item.hidden)?.focus({ preventScroll: true });
    links[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const fromHash = () => {
    try {
      const id = decodeURIComponent(globalThis.location.hash.slice(1));
      const item = items.find((item) => item.id === id);
      return item?.dataset.guidePage;
    } catch {
      return undefined;
    }
  };
  const go = (id) => {
    select(id, true);
    globalThis.location.hash = encodeURIComponent(id);
  };
  for (const link of links)
    link.addEventListener('click', (event) => {
      event.preventDefault();
      go(link.dataset.guideTarget);
    });
  const move = (delta) => {
    const link = links[index + delta];
    if (link) go(link.dataset.guideTarget);
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  globalThis.addEventListener('hashchange', () => select(fromHash(), false));
  globalThis.document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      globalThis.document.querySelector('dialog[open]') ||
      event.target.closest('input,textarea,select,[contenteditable]')
    )
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  select(fromHash() ?? links[0].dataset.guideTarget, false);
  pager.hidden = false;
})();
`;

it('admits the retained caption-aware guide runtime while rejecting archive-selected trust', async () => {
  const current = await fixture('guide');
  const retained = await fixture('guide', retainedCaptionGuideRuntime);
  expect(retained.hash).toBe('Om79Cdbfp0CYdQb8K01kOmAsY7YHTTtCrkrwSnNfFHo=');
  expect(current.hash).not.toBe(retained.hash);
  expect(await admitSavedScenarioHtml(retained.blob, 'guide', current.hash)).toBe(true);
  expect(await retained.blob.text()).toBe(retained.html);
  expect(document.querySelector('[data-guide-viewer]')).toBeNull();
  for (const html of [
    retained.html.replace('dialog.showModal();', 'globalThis.alert(1);'),
    retained.html.replace("default-src 'none'", 'default-src *'),
    retained.html.replace('img-src data:', 'img-src data: https:'),
    retained.html.replace('</body>', '<script>alert(1)</script></body>'),
  ])
    expect(await admitSavedScenarioHtml(new Blob([html]), 'guide', current.hash)).toBe(false);
  const unknown = await fixture('guide', retainedCaptionGuideRuntime + '\n// unknown executable');
  expect(await admitSavedScenarioHtml(unknown.blob, 'guide', current.hash)).toBe(false);
  const wrongMode = await fixture('tour', retainedCaptionGuideRuntime);
  expect(await admitSavedScenarioHtml(wrongMode.blob, 'tour', current.hash)).toBe(false);
});

// Immutable built bundles from 3542f819 and 4777f97e; never regenerate from current code.
it.each([
  {
    name: 'pre-marker',
    runtime: retainedTourRuntime,
    bytes: 124519,
    hash: 'wcvHun2bWRhYVo/KsSUC86BDTL0POnoKio273Y5dkb4=',
  },
  {
    name: 'pre-stage-background',
    runtime: retainedMarkerTourRuntime,
    bytes: 125170,
    hash: 'Wzekv7b/kkq0XmPuhHgXIz8+9wALBHFuTqMr2mAuGfQ=',
  },
])(
  'admits exact $name Tour bytes without extending Guide or archive trust',
  async ({ runtime, bytes, hash }) => {
    const current = await fixture('tour');
    const retained = await fixture('tour', runtime);
    expect(new TextEncoder().encode(runtime)).toHaveLength(bytes);
    expect(retained.hash).toBe(hash);
    expect(current.hash).not.toBe(retained.hash);
    expect(await admitSavedScenarioHtml(retained.blob, 'tour', current.hash)).toBe(true);
    expect(await retained.blob.text()).toBe(retained.html);
    expect(document.querySelector('#tour-player')).toBeNull();
    for (const html of [
      retained.html.replace('<script>', '<script>/* modified */'),
      retained.html.replace("default-src 'none'", 'default-src *'),
      retained.html.replace('media-src data:', 'media-src data: https:'),
      retained.html.replace('</body>', '<script>alert(1)</script></body>'),
    ])
      expect(await admitSavedScenarioHtml(new Blob([html]), 'tour', current.hash)).toBe(false);
    const unknown = await fixture('tour', runtime + '\n// unknown executable');
    expect(await admitSavedScenarioHtml(unknown.blob, 'tour', current.hash)).toBe(false);
    const wrongMode = await fixture('guide', runtime);
    expect(await admitSavedScenarioHtml(wrongMode.blob, 'guide', current.hash)).toBe(false);
  }
);
