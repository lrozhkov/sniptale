// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SceneCanvasFields } from './scene-canvas';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
function mount(width = 1920, height = 1080) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const commit = vi.fn();
  function Harness() {
    const [size, setSize] = useState({ width, height });
    return (
      <SceneCanvasFields
        {...size}
        onResizeProject={(w, h) => {
          commit(w, h);
          setSize({ width: w, height: h });
        }}
      />
    );
  }
  act(() => root!.render(<Harness />));
  return commit;
}
async function choose(label: string, text: string) {
  act(() =>
    container
      .querySelector<HTMLButtonElement>(`button[aria-label="videoEditor.sidebar.${label}"]`)!
      .click()
  );
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (el) => el.textContent?.includes(text)
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
}
it('changes aspect and resolution atomically and keeps manual dimensions out of primary controls', async () => {
  const commit = mount();
  expect(container.querySelector('details')?.open).toBe(false);
  expect(container.querySelector('[role="slider"]')).toBeNull();
  await choose('canvasFormatLabel', '9:16');
  expect(commit).toHaveBeenLastCalledWith(1080, 1920);
  await choose('canvasResolutionLabel', '720 × 1280');
  expect(commit).toHaveBeenLastCalledWith(720, 1280);
  await choose('canvasFormatLabel', '1:1');
  expect(commit).toHaveBeenLastCalledWith(720, 720);
  expect(commit).toHaveBeenCalledTimes(3);
});
it('represents custom dimensions without silently rounding on mount and keeps sizes bounded', async () => {
  const commit = mount(7680, 7680);
  expect(commit).not.toHaveBeenCalled();
  await choose('canvasFormatLabel', '16:9');
  expect(commit).toHaveBeenLastCalledWith(7680, 4320);
});
