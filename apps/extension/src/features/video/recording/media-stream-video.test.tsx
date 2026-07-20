// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { MediaStreamVideo } from './media-stream-video';

it('binds the provided media stream to the rendered video element', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const stream = {} as MediaStream;

  act(() => root.render(<MediaStreamVideo stream={stream} />));

  const video = container.querySelector('video');
  expect(video?.srcObject).toBe(stream);
  expect(video?.autoplay).toBe(true);
  expect(video?.muted).toBe(true);
  expect(video?.playsInline).toBe(true);

  act(() => root.unmount());
});
