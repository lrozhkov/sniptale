// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { installSnapshotFrameLayoutPolicy } from './frame-layout';

it('fits only the captured static overlay layer without clipping document overflow', () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const frameDocument = iframe.contentDocument!;
  frameDocument.body.innerHTML = `
    <main style="width: 2577px">Genuinely wide snapshot content</main>
    <div data-sniptale-static-overlay-layer="true" style="left: 0; width: 2560px"></div>
  `;

  const cleanup = installSnapshotFrameLayoutPolicy(iframe);
  const policy = frameDocument.head.querySelector<HTMLStyleElement>(
    '[data-sniptale-viewer-layout-policy]'
  );

  expect(policy?.textContent).toContain(
    '[data-sniptale-static-overlay-layer="true"]{right:0!important;width:auto!important}'
  );
  expect(policy?.textContent).not.toContain('overflow-x');
  expect(frameDocument.querySelector('main')?.getAttribute('style')).toBe('width: 2577px');

  cleanup();
  expect(frameDocument.head.querySelector('[data-sniptale-viewer-layout-policy]')).toBeNull();
  iframe.remove();
});
