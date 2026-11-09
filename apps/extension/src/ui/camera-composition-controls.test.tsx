// @vitest-environment jsdom
import { InspectorLayout } from './compact-inspector-controls/layout';
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
  vi.restoreAllMocks();
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

it('reports only completed cursor absence without an empty status row', () => {
  const change = vi.fn();
  const render = (available: boolean, pending: boolean) =>
    act(() =>
      root.render(
        <CameraFollowTargetControls
          following
          cursorAvailable={available}
          cursorPending={pending}
          onChange={change}
        />
      )
    );
  render(false, true);
  expect(host.querySelector('[data-ui="camera.cursorStatus"]')).toBeNull();
  expect(host.querySelector('[data-ui="camera.followTarget"]')?.getAttribute('aria-busy')).toBe(
    'true'
  );
  render(false, false);
  expect(host.querySelector('[data-ui="camera.cursorStatus"]')?.textContent).toContain(
    'videoEditor.sidebar.cursorFocusUnavailable'
  );
  render(true, false);
  expect(host.querySelector('[data-ui="camera.cursorStatus"]')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
it('shows legacy absence as Off and offers the four authored modes', async () => {
  const change = vi.fn();
  await act(async () => root.render(<CameraCompositionControls onChange={change} />));
  expect(host.textContent).toContain('editor.scene.cameraCompositionOff');
  expect(host.querySelector('[aria-label="editor.scene.cameraCompositionAmount"]')).toBeNull();
  const choices = [...host.querySelectorAll<HTMLButtonElement>('[aria-pressed]')];
  expect(choices).toHaveLength(4);
  await act(async () =>
    choices.find((choice) => choice.title === 'editor.scene.cameraCompositionOrbit')!.click()
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

it('adapts composition choices without changing retained camera settings', async () => {
  const resize = mockChoiceWidth();
  const change = vi.fn();
  let value = { ...DEFAULT_CURSOR_COMPOSITION, amount: 0.73, smoothness: 0.29 };
  const render = () =>
    act(() =>
      root.render(
        <InspectorLayout>
          <CameraCompositionControls value={value} onChange={change} />
        </InspectorLayout>
      )
    );
  const group = () =>
    host.querySelector('[role="group"][aria-label="editor.scene.cameraComposition"]');
  render();
  expect(group()?.querySelectorAll('button')).toHaveLength(4);
  act(() =>
    group()!
      .querySelector<HTMLButtonElement>('[title="editor.scene.cameraCompositionLeft"]')!
      .click()
  );
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, mode: 'left' });
  value = { ...value, mode: 'left' };
  render();
  resize(100);
  expect(group()).toBeNull();
  expect(change).toHaveBeenCalledTimes(1);
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="editor.scene.cameraComposition"]'
  )!;
  expect(trigger.textContent).toContain('editor.scene.cameraCompositionLeft');
  await act(async () => trigger.click());
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('editor.scene.cameraCompositionOff'))!
      .click()
  );
  expect(change).toHaveBeenLastCalledWith({ ...value, mode: 'off' });
  value = { ...value, mode: 'off' };
  render();
  act(() =>
    (document.activeElement instanceof window.HTMLElement ? document.activeElement : null)?.blur()
  );
  resize(2000);
  expect(
    group()!
      .querySelector('[title="editor.scene.cameraCompositionOff"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(host.querySelector('input[aria-label="editor.scene.cameraCompositionAmount"]')).toBeNull();
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="editor.scene.cameraCompositionSmoothness"]'
    )?.value
  ).toBe('29');
  act(() =>
    group()!
      .querySelector<HTMLButtonElement>('[title="editor.scene.cameraCompositionRight"]')!
      .click()
  );
  expect(change).toHaveBeenLastCalledWith({ ...value, mode: 'right' });
  expect(change).toHaveBeenCalledTimes(3);
});

function mockChoiceWidth() {
  let width = 2000;
  const callbacks = new Set<() => void>();
  vi.spyOn(window.HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {
        callbacks.add(callback);
      }
      observe() {}
      disconnect() {
        callbacks.delete(this.callback);
      }
    }
  );
  return (next: number) => {
    width = next;
    act(() => callbacks.forEach((callback) => callback()));
  };
}
