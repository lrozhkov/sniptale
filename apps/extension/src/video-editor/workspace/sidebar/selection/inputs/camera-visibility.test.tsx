// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CameraVisibilityControls } from './camera-visibility';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function fixture() {
  const project = createEmptyVideoProject('Camera');
  const asset = createVideoProjectAsset(
    'Camera',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset('camera', asset, project.width, project.height, 10);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceStart = 2;
  clip.sourceDuration = 6;
  clip.playbackRate = 2;
  clip.duration = 3;
  return { clip, currentTime: 10.5, sourceDuration: 10, disabled: false, onEdit: vi.fn() };
}
function button(label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="videoEditor.sidebar.${label}"]`
  )!;
}
function input(label: string) {
  return container.querySelector<HTMLInputElement>(
    `input[aria-label="videoEditor.sidebar.${label}"]`
  )!;
}
function number(label: string, value: string) {
  const field = input(label);
  act(() => field.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
}
it('adds a source-clock interval, commits one bound once and removes only its ID', () => {
  const props = fixture();
  act(() => root.render(<CameraVisibilityControls {...props} />));
  expect(container.textContent).toContain('cameraHiddenRanges');
  expect(input('cameraHiddenStart')).toBeNull();
  act(() => button('cameraHideInterval').click());
  expect(props.onEdit).toHaveBeenLastCalledWith(props.clip.id, { kind: 'hide', start: 3, end: 5 });
  props.clip.cameraHiddenRanges = [{ id: 'hidden', start: 3, end: 5 }];
  props.onEdit.mockClear();
  act(() => root.render(<CameraVisibilityControls {...props} />));
  expect(input('cameraHiddenStart').value).toBe('3');
  expect(button('cameraHideInterval').disabled).toBe(true);
  number('cameraHiddenEnd', '6');
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(props.clip.id, {
    kind: 'hide',
    id: 'hidden',
    start: 3,
    end: 6,
  });
  act(() => button('cameraShowInterval').click());
  expect(props.onEdit).toHaveBeenLastCalledWith(props.clip.id, { kind: 'show', id: 'hidden' });
  expect(button('cameraShowInterval').querySelector('svg')).not.toBeNull();
});
it('keeps sub-millisecond authored bounds when the displayed value is committed unchanged', () => {
  const props = fixture();
  props.clip.cameraHiddenRanges = [{ id: 'precise', start: 2.123456, end: 7.987654 }];
  act(() => root.render(<CameraVisibilityControls {...props} />));
  number('cameraHiddenStart', '2.123');
  expect(props.onEdit).not.toHaveBeenCalled();
  number('cameraHiddenEnd', '7.988');
  expect(props.onEdit).not.toHaveBeenCalled();
});
it('shows retained ranges outside the trimmed window and clamps edits against adjacent ranges', () => {
  const props = fixture();
  props.clip.cameraHiddenRanges = [
    { id: 'early', start: 0, end: 1 },
    { id: 'late', start: 9, end: 12 },
  ];
  act(() => root.render(<CameraVisibilityControls {...props} />));
  expect(input('cameraHiddenStart').value).toBe('9');
  expect(input('cameraHiddenEnd').value).toBe('12');
  number('cameraHiddenStart', '0');
  expect(props.onEdit).toHaveBeenLastCalledWith(props.clip.id, {
    kind: 'hide',
    id: 'late',
    start: 1,
    end: 12,
  });
  number('cameraHiddenEnd', '15');
  expect(props.onEdit).toHaveBeenLastCalledWith(props.clip.id, {
    kind: 'hide',
    id: 'late',
    start: 9,
    end: 12,
  });
});
it('restricts addition to the current visible source window and disables all edits when locked or disconnected', () => {
  const props = fixture();
  act(() => root.render(<CameraVisibilityControls {...props} currentTime={12.9} />));
  act(() => button('cameraHideInterval').click());
  expect(props.onEdit).toHaveBeenLastCalledWith(props.clip.id, {
    kind: 'hide',
    start: expect.closeTo(7.8),
    end: 8,
  });
  act(() => root.render(<CameraVisibilityControls {...props} currentTime={13} />));
  expect(button('cameraHideInterval').disabled).toBe(true);
  props.clip.cameraHiddenRanges = [{ id: 'hidden', start: 3, end: 5 }];
  act(() => root.render(<CameraVisibilityControls {...props} disabled />));
  expect(button('cameraShowInterval').disabled).toBe(true);
  expect(input('cameraHiddenEnd').disabled).toBe(true);
  const { onEdit: _onEdit, ...disconnected } = props;
  act(() => root.render(<CameraVisibilityControls {...disconnected} />));
  expect(button('cameraShowInterval').disabled).toBe(true);
  expect(input('cameraHiddenStart').disabled).toBe(true);
});

it('preserves admitted narrow intervals when their rounded values are committed unchanged', () => {
  const props = fixture();
  props.clip.cameraHiddenRanges = [{ id: 'precise', start: 3.12341, end: 3.12342 }];
  act(() => root.render(<CameraVisibilityControls {...props} />));
  number('cameraHiddenStart', '3.123');
  number('cameraHiddenEnd', '3.123');
  expect(props.onEdit).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-invalid="true"]')).toBeNull();
});
it('selects a retained interval without moving the playhead and commits to the selected identity', async () => {
  const props = fixture();
  props.clip.cameraHiddenRanges = [
    { id: 'early', start: 0, end: 1 },
    { id: 'current', start: 3, end: 5 },
  ];
  act(() => root.render(<CameraVisibilityControls {...props} />));
  expect(input('cameraHiddenStart').value).toBe('3');
  await act(async () => {
    button('cameraHiddenRange').click();
    await Promise.resolve();
  });
  const option = document.querySelector<HTMLButtonElement>('[role="option"]')!;
  expect(option).not.toBeNull();
  await act(async () => {
    option.click();
    await Promise.resolve();
  });
  expect(input('cameraHiddenStart').value).toBe('0');
  expect(props.onEdit).not.toHaveBeenCalled();
  number('cameraHiddenEnd', '2');
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(props.clip.id, {
    kind: 'hide',
    id: 'early',
    start: 0,
    end: 2,
  });
});
