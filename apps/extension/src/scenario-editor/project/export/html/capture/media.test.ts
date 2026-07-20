import { expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', () => ({
  getCurrentLocale: () => 'ru',
  translate: (key: string) => key,
}));

import {
  renderCaptureLightboxHtml,
  renderCaptureMediaHtml,
  renderCaptureSectionHtml,
} from './media';

it('renders lightbox markup with close-label copy', () => {
  const html = renderCaptureLightboxHtml('Heading', 'lightbox-1', 'data:image/png;base64,asset');

  expect(html).toContain('class="lightbox"');
  expect(html).toContain('scenario.editor.exportClosePreview');
  expect(html).toContain('lightbox-1');
});

it('renders media as a lightbox trigger only when a full-size image is available', () => {
  const interactiveHtml = renderCaptureMediaHtml(
    'Heading',
    'lightbox-1',
    'data:image/png;base64,preview',
    'data:image/png;base64,full'
  );
  const staticHtml = renderCaptureMediaHtml(
    'Heading',
    'lightbox-1',
    'data:image/png;base64,preview',
    null
  );

  expect(interactiveHtml).toContain('capture-media-link');
  expect(interactiveHtml).toContain('scenario.editor.exportOpenFullImage');
  expect(staticHtml).not.toContain('capture-media-link');
  expect(staticHtml).toContain('capture-preview');
});

it('renders the capture section with the shared media frame', () => {
  const html = renderCaptureSectionHtml({
    body: '<p class="step-body">Body</p>',
    captureIndex: 2,
    fullImageDataUrl: null,
    heading: 'Heading',
    lightboxId: 'lightbox-2',
    previewDataUrl: 'data:image/png;base64,preview',
  });

  expect(html).toContain('class="capture-step"');
  expect(html).toContain('class="capture-media"');
  expect(html).toContain('step-index">02<');
});
