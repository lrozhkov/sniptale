// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMediaFitMode, VideoProjectClipType } from '../../../../features/video/project/types';
import { renderMediaPreviewClip } from './media';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('places media clip shadow on a non-clipped preview wrapper', () => {
  renderMediaClip({
    boxShadow: '0px 7.5px 24px rgba(0, 0, 0, 0.28)',
  });

  const wrapper = container?.querySelector<HTMLElement>('[data-preview-media-shadow-wrapper]');
  const frame = container?.querySelector<HTMLElement>('[data-preview-media-frame]');

  expect(wrapper?.style.boxShadow).toBe('0px 7.5px 24px rgba(0, 0, 0, 0.28)');
  expect(wrapper?.className).not.toContain('overflow-hidden');
  expect(frame?.className).toContain('overflow-hidden');
});

it('omits media clip shadow style when intensity resolves to zero', () => {
  renderMediaClip({});

  const wrapper = container?.querySelector<HTMLElement>('[data-preview-media-shadow-wrapper]');

  expect(wrapper?.style.boxShadow).toBe('');
});

function renderMediaClip(commonStyle: React.CSSProperties) {
  act(() => {
    root?.render(
      renderMediaPreviewClip({
        assetUrls: { 'asset-1': 'blob:image' },
        clip: {
          assetId: 'asset-1',
          fitMode: VideoMediaFitMode.CONTAIN,
          id: 'clip-1',
          name: 'Image',
          type: VideoProjectClipType.IMAGE,
        } as never,
        commonStyle,
        selectedClipId: null,
        videoRefs: { current: {} },
        onBeginInteraction: vi.fn(),
      })
    );
  });
}
