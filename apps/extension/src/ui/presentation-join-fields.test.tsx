// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresentationJoinFields } from './presentation-join-fields';
import type { CompositionJoinSettings } from '../features/video/project/scene/composition-join';
import type { InspectorDisclosureProps } from './compact-inspector-controls/shared';

vi.mock('../platform/i18n', async (original) => ({
  ...(await original<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
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
const Details = (props: InspectorDisclosureProps) => <div>{props.children}</div>;
function render(value: CompositionJoinSettings | undefined, timing?: CompositionJoinSettings) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <PresentationJoinFields
        label="Join"
        value={value}
        timing={timing}
        Details={Details}
        preferenceId="test.join"
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  return { onChange, onPreview };
}
function accept(label: string, value: string, key = 'Enter') {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}
it('scales the projected duration proportionally without replacing the authored kind or color', () => {
  const callbacks = render(
    { type: 'fade-black', before: 1, after: 3, color: '#121212' },
    { type: 'fade-black', before: 0.1, after: 0.3 }
  );
  accept('gallery.videoReview.presentationDuration', '2');
  expect(callbacks.onChange).toHaveBeenCalledExactlyOnceWith({
    type: 'fade-black',
    before: 0.5,
    after: 1.5,
    color: '#121212',
  });
  expect(callbacks.onPreview).toHaveBeenLastCalledWith(null);
});
it('cancels a numeric edit without committing or changing the accepted value', () => {
  const callbacks = render({ type: 'dissolve', before: 0.2, after: 0.2 });
  accept('gallery.videoReview.presentationJoinBefore', '0.8', 'Escape');
  expect(callbacks.onChange).not.toHaveBeenCalled();
  expect(callbacks.onPreview).toHaveBeenLastCalledWith(null);
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.presentationJoinBefore"]'
    )!.value
  ).toBe('0.2');
});
it('offers three direct choices and retains timings and color across active kinds', () => {
  const callbacks = render({ type: 'dissolve', before: 0, after: 0.4, color: '#123456' });
  const choices = host.querySelector('[role="group"][aria-label="Join"]')!;
  expect(choices.querySelectorAll('button')).toHaveLength(3);
  act(() =>
    [...choices.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'gallery.videoReview.cutFadeColor')!
      .click()
  );
  expect(callbacks.onChange).toHaveBeenLastCalledWith({
    type: 'fade-black',
    before: 0,
    after: 0.4,
    color: '#123456',
  });
  act(() =>
    [...choices.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'gallery.videoReview.transitionNone')!
      .click()
  );
  expect(callbacks.onChange).toHaveBeenLastCalledWith(null);
});
