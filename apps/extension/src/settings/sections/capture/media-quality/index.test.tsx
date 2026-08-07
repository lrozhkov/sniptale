// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./image', () => ({ ImageSettingsSection: () => <div>image-owner</div> }));
vi.mock('./video', () => ({ VideoQualityProfilesSection: () => <div>video-owner</div> }));
import { MediaQualitySection } from '.';

it('composes image and video owners through the selected view', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<MediaQualitySection view="video" />));
  expect(container.textContent).toContain('video-owner');
  expect(container.textContent).not.toContain('image-owner');
  act(() => root.unmount());
});

it('defaults to images and forwards route navigation', () => {
  const onViewChange = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<MediaQualitySection onViewChange={onViewChange} />));
  expect(container.textContent).toContain('image-owner');
  act(() => container.querySelectorAll('button')[1]?.click());
  expect(onViewChange).toHaveBeenCalledWith('video');
  act(() => root.unmount());
});
