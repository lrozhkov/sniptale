// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaFrameControls } from './media-frame';
import { translate } from '../../../../../platform/i18n';
import { createProjectWithMediaTrack } from '../../../../project/state/clip-property/content.test-support';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('dispatches source filter insertion through the selected video edit callback and omits image clips', async () => {
  const project = createProjectWithMediaTrack(),
    clip = project.clips.find((item) => item.id === 'clip-video')!,
    onEditMediaClip = vi.fn();
  const props = {
    project,
    clip,
    locked: false,
    onEditMediaClip,
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMediaClipFitScalePercent: vi.fn(),
    onUpdateMediaClipShadowIntensity: vi.fn(),
    onUpdateMediaClipShadowMode: vi.fn(),
    onUpdateMediaClipShadowColor: vi.fn(),
  };
  act(() => root.render(<MediaFrameControls {...props} />));
  const add = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === translate('videoEditor.sidebar.sourceFiltersAdd')
  );
  if (!add) throw new Error('Missing shared source filter action');
  const disclosure = add.closest('details');
  if (disclosure)
    act(() => {
      disclosure.open = true;
      disclosure.dispatchEvent(new Event('toggle'));
    });
  await act(async () => add.click());
  const blur = [...document.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(
    (item) => item.textContent === translate('videoEditor.sidebar.sourceFiltersAddBlur')
  );
  if (!blur) throw new Error('Missing Blur option');
  await act(async () => blur.click());
  expect(onEditMediaClip).toHaveBeenCalledWith(clip.id, {
    kind: 'source-filters',
    stack: {
      version: 1,
      filters: [
        expect.objectContaining({
          kind: 'blur',
          enabled: true,
          intensity: 1,
          parameters: { radius: 8 },
        }),
      ],
    },
  });
  act(() => root.render(<MediaFrameControls {...props} locked />));
  expect(
    [...host.querySelectorAll('button')]
      .find(
        (item) =>
          item.getAttribute('aria-label') === translate('videoEditor.sidebar.sourceFiltersAdd')
      )
      ?.matches(':disabled')
  ).toBe(true);
  const image = project.clips.find((item) => item.id === 'clip-image')!;
  act(() => root.render(<MediaFrameControls {...props} clip={image} />));
  expect(host.querySelector('[data-ui="shared.ui.source-image-filter-fields"]')).toBeNull();
});
