// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CameraCompositionControls,
  CameraFollowTargetControls,
} from './camera-composition-controls';
import { DEFAULT_CURSOR_COMPOSITION } from '../features/video/project/motion/spatial';

vi.mock('../platform/i18n', async (original) => ({
  ...(await original<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('keeps Manual available when captured cursor data is missing', () => {
  const change = vi.fn();
  act(() =>
    root.render(<CameraFollowTargetControls following cursorAvailable={false} onChange={change} />)
  );
  const buttons = host.querySelectorAll<HTMLButtonElement>('button');
  expect(buttons[0]!.disabled).toBe(true);
  expect(buttons[1]!.disabled).toBe(false);
  act(() => buttons[0]!.click());
  expect(change).not.toHaveBeenCalled();
  act(() => buttons[1]!.click());
  expect(change).toHaveBeenCalledExactlyOnceWith(false);
});
it('shows legacy absence as Off and offers the four authored modes', async () => {
  const change = vi.fn();
  await act(async () => root.render(<CameraCompositionControls onChange={change} />));
  expect(host.textContent).toContain('editor.scene.cameraCompositionOff');
  expect(host.querySelector('[aria-label="editor.scene.cameraCompositionAmount"]')).toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="editor.scene.cameraComposition"]')!.click()
  );
  const choices = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(choices).toHaveLength(4);
  await act(async () =>
    choices
      .find((choice) => choice.textContent?.includes('editor.scene.cameraCompositionOrbit'))!
      .click()
  );
  expect(change).toHaveBeenCalledExactlyOnceWith(DEFAULT_CURSOR_COMPOSITION);
});
it('previews rotation amount, cancels Escape and commits one following gesture', async () => {
  const preview = vi.fn(),
    change = vi.fn();
  await act(async () =>
    root.render(
      <CameraCompositionControls
        value={DEFAULT_CURSOR_COMPOSITION}
        onChange={change}
        onPreview={preview}
      />
    )
  );
  const slider = host.querySelector<HTMLInputElement>(
    'input[type="range"][aria-label="editor.scene.cameraCompositionAmount range"]'
  )!;
  const key = (type: string, key: string) =>
    act(() => slider.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
  key('keydown', 'ArrowRight');
  expect(preview).toHaveBeenLastCalledWith({ ...DEFAULT_CURSOR_COMPOSITION, amount: 0.51 });
  expect(change).not.toHaveBeenCalled();
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(change).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_CURSOR_COMPOSITION, amount: 0.51 });
});
