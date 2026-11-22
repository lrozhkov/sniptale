// @vitest-environment jsdom
import {
  GL_TRANSITIONS,
  createGlTransitionSelection,
} from '../features/video/project/transition/gl-catalog';
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
it('offers every bundled GL choice and preserves authored timing when explicitly replacing a legacy kind', async () => {
  const callbacks = render({ type: 'dissolve', before: 0, after: 0.4, color: '#123456' });
  const open = () =>
    act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Join"]')!.click());
  const select = (name: string) =>
    act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((option) => option.textContent === name)!
        .click()
    );
  await open();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(GL_TRANSITIONS.length + 3);
  const labels = new Set(
    [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent)
  );
  for (const entry of GL_TRANSITIONS)
    expect(labels.has(`videoEditor.glTransitions.names.${entry.name}`), entry.name).toBe(true);
  await select('videoEditor.glTransitions.names.CrossZoom');
  expect(callbacks.onChange).toHaveBeenLastCalledWith({
    type: 'gl',
    before: 0,
    after: 0.4,
    selection: createGlTransitionSelection('CrossZoom'),
    easing: 'LINEAR',
  });
  await open();
  await select('gallery.videoReview.cutFadeColor');
  expect(callbacks.onChange).toHaveBeenLastCalledWith({
    type: 'fade-black',
    before: 0,
    after: 0.4,
    color: '#123456',
  });
  await open();
  await select('gallery.videoReview.transitionNone');
  expect(callbacks.onChange).toHaveBeenLastCalledWith(null);
});

it('keeps the pinned GL selection and easing when editing loaded join timing', () => {
  const selection = createGlTransitionSelection('BowTie')!;
  const settings = {
    type: 'gl' as const,
    selection,
    easing: 'EASE_IN_OUT' as const,
    before: 0.2,
    after: 0.2,
  };
  const callbacks = render(settings);
  expect(host.textContent).toContain('videoEditor.glTransitions.names.BowTie');
  accept('gallery.videoReview.presentationDuration', '0.8');
  expect(callbacks.onChange).toHaveBeenCalledExactlyOnceWith({
    ...settings,
    before: 0.4,
    after: 0.4,
  });
});

it('forwards an opaque preset slot only into a GL join without changing timing or easing', () => {
  const value = {
      type: 'gl' as const,
      selection: createGlTransitionSelection('Fade')!,
      before: 0.3,
      after: 0.7,
      easing: 'EASE_IN_OUT' as const,
    },
    change = vi.fn(),
    action = vi.fn();
  const mount = (current: CompositionJoinSettings | undefined) =>
    root.render(
      <PresentationJoinFields
        label="Join"
        value={current}
        Details={Details}
        preferenceId="preset-slot"
        onChange={change}
        onPreview={vi.fn()}
        glPresetActions={
          <button data-testid="preset-slot" onClick={action}>
            Preset action
          </button>
        }
      />
    );
  act(() => mount(value));
  const button = host.querySelector<HTMLButtonElement>('[data-testid=preset-slot]')!;
  expect(button).not.toBeNull();
  act(() => button.click());
  expect(action).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
  accept('gallery.videoReview.presentationJoinBefore', '0.5');
  expect(change).toHaveBeenLastCalledWith({ ...value, before: 0.5 });
  act(() => mount(undefined));
  expect(host.querySelector('[data-testid=preset-slot]')).toBeNull();
});
