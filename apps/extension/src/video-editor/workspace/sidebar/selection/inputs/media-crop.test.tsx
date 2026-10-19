// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { translate } from '../../../../../platform/i18n';
import { MediaCropControls } from './media-crop';
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('edits exact source percentages and resets through the typed port', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'crop',
    filename: 'crop.webm',
    width: 400,
    height: 200,
    duration: 10,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  clip.sourceCrop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
  const onEdit = vi.fn();
  act(() =>
    root.render(
      <MediaCropControls
        project={project}
        clip={clip}
        currentTime={2}
        disabled={false}
        onEdit={onEdit}
      />
    )
  );
  const width = [...container.querySelectorAll('input')].find(
    (input) => input.getAttribute('aria-label') === translate('videoEditor.sidebar.mediaCropWidth')
  )!;
  expect(width).toBeDefined();
  act(() => {
    width.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '45');
    width.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onEdit).toHaveBeenCalledWith(clip.id, {
    kind: 'source-crop',
    crop: { ...clip.sourceCrop, width: 0.45 },
  });
  onEdit.mockClear();
  const reset = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(translate('gallery.videoReview.sourceCropReset'))
  )!;
  act(() => reset.click());
  expect(onEdit).toHaveBeenCalledWith(clip.id, { kind: 'source-crop', crop: null });
  act(() =>
    root.render(
      <MediaCropControls project={project} clip={clip} currentTime={2} disabled onEdit={onEdit} />
    )
  );
  expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
});
