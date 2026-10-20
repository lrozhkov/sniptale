// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { KeyboardFeedbackFields } from './fields';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement, root: Root;
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
it('emits one partial display patch and preserves disabled controlled values', () => {
  const change = vi.fn();
  const render = (disabled: boolean) =>
    act(() =>
      root.render(
        <KeyboardFeedbackFields
          values={[REVIEW_KEY_DEFAULT]}
          part="display"
          disabled={disabled}
          onChange={change}
        />
      )
    );
  render(false);
  const caption = [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
    (button) => button.textContent === 'gallery.videoReview.keyCaption'
  )!;
  act(() => caption.click());
  expect(change).toHaveBeenLastCalledWith({ enabled: true });
  expect(REVIEW_KEY_DEFAULT.enabled).toBe(false);
  render(true);
  change.mockClear();
  act(() => caption.click());
  expect(change).not.toHaveBeenCalled();
});
it('retains all three font families and changes only the selected style property', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <KeyboardFeedbackFields
        values={[{ ...REVIEW_KEY_DEFAULT, enabled: true }]}
        part="appearance"
        onChange={change}
      />
    )
  );
  const mono = [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
    (button) => button.textContent === 'videoEditor.sidebar.keyMono'
  )!;
  act(() => mono.click());
  expect(change).toHaveBeenLastCalledWith({ style: { fontFamily: 'monospace' } });
  expect(
    host.querySelector('input[aria-label="videoEditor.sidebar.actionOpacity"]')
  ).not.toBeNull();
  expect(host.querySelector('input[aria-label="gallery.videoReview.key_fontSize"]')).not.toBeNull();
});

it('renders one mixed display status for a batch with different enabled values', () => {
  act(() =>
    root.render(
      <KeyboardFeedbackFields
        values={[REVIEW_KEY_DEFAULT, { ...REVIEW_KEY_DEFAULT, enabled: true }]}
        part="display"
        onChange={() => {}}
      />
    )
  );
  expect(
    [...host.querySelectorAll('p')].filter(
      (node) => node.textContent === 'gallery.videoReview.clickMixed'
    )
  ).toHaveLength(1);
});
