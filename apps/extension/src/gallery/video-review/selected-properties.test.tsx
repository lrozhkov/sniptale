// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSelectedProperties } from './selected-properties';
import type { ReviewCutTransition, ReviewEdit } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./use-zoom-preview-source', () => ({ useZoomPreviewSource: () => null }));
vi.mock('./edit-range-fields', () => ({ ReviewEditRangeFields: () => null }));
vi.mock('./controls', async (original) => ({
  ...(await original<typeof import('./controls')>()),
  ReviewDetails: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// Real control focus/Escape/blur is covered in the browser. This adapter exercises
// the inspector's draft, coupled values and asynchronous commit boundary directly.
vi.mock('../../ui/compact-inspector-controls', () => ({
  SelectField: (props: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  NumericRow: (props: {
    label: string;
    value: number;
    onPreviewValue(value: number): void;
    onCommitValue(value: number): void;
  }) => (
    <input
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onPreviewValue(Number(event.target.value))}
      onBlur={(event) => props.onCommitValue(Number(event.target.value))}
    />
  ),
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});
function mount(transition?: ReviewCutTransition) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const edit: Extract<ReviewEdit, { kind: 'cut' }> = {
    id: 'cut',
    kind: 'cut',
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
    ...(transition ? { transition } : {}),
  };
  const change = vi.fn<(value: ReviewCutTransition | null) => Promise<boolean>>(async (value) => {
    if (value) edit.transition = value;
    else delete edit.transition;
    return true;
  });
  const props = {
    selection: { kind: 'edit', id: edit.id },
    advanced: { ui: { mode: 'advanced' } },
    editing: {
      selected: edit,
      exporter: { phase: 'idle', index: null },
      changeSelectedTransition: change,
    },
    resource: {
      source: { duration: 6 },
      file: null,
      session: { getSnapshot: () => ({ document: { edits: [edit] } }) },
    },
    busy: false,
  } as unknown as ComponentProps<typeof ReviewSelectedProperties>;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<ReviewSelectedProperties {...props} />));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const input = (field: 'Duration' | 'Before' | 'After') => {
    const key = field === 'Duration' ? 'zoomTransitionDuration' : `cutTransition${field}`;
    return host.querySelector<HTMLInputElement>(`input[aria-label="gallery.videoReview.${key}"]`)!;
  };
  const draft = async (field: 'Duration' | 'Before' | 'After', value: number) => {
    const node = input(field);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        node,
        String(value)
      );
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const commit = (field: 'Duration' | 'Before' | 'After') =>
    act(async () => input(field).dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  return { host, edit, change, input, draft, commit };
}

it('scales both sides with total duration and commits asymmetric side changes independently', async () => {
  const view = mount({ type: 'dissolve', before: 0.25, after: 0.75 });
  await view.draft('Duration', 2);
  expect(view.change).not.toHaveBeenCalled();
  expect(view.input('Before').value).toBe('0.5');
  expect(view.input('After').value).toBe('1.5');
  await view.commit('Duration');
  expect(view.change).toHaveBeenLastCalledWith({ type: 'dissolve', before: 0.5, after: 1.5 });
  await view.draft('Before', 0);
  await view.commit('Before');
  expect(view.change).toHaveBeenLastCalledWith({ type: 'dissolve', before: 0, after: 1.5 });
  await view.draft('After', 0);
  await view.commit('After');
  expect(view.change).toHaveBeenLastCalledWith(null);
});

it('disables the inspector during a pending save and restores authored values when it fails', async () => {
  const view = mount({ type: 'fade-black', before: 0.5, after: 0.5 });
  let finish!: (result: boolean) => void;
  view.change.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    })
  );
  await view.draft('Duration', 2);
  await view.commit('Duration');
  expect(
    view.host.querySelector<HTMLFieldSetElement>('[data-ui="gallery.videoReview.cutTransition"]')!
      .disabled
  ).toBe(true);
  await act(async () => finish(false));
  expect(view.input('Duration').value).toBe('1');
  expect(view.edit.transition).toEqual({ type: 'fade-black', before: 0.5, after: 0.5 });
});

it('creates default side lengths from none and switches the type without losing authored lengths', async () => {
  const view = mount();
  const select = view.host.querySelector('select')!;
  await act(async () => {
    select.value = 'dissolve';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(view.change).toHaveBeenLastCalledWith({ type: 'dissolve', before: 0.25, after: 0.25 });
  await act(async () => {
    select.value = 'fade-black';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(view.change).toHaveBeenLastCalledWith({ type: 'fade-black', before: 0.25, after: 0.25 });
  await act(async () => {
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(view.change).toHaveBeenLastCalledWith(null);
});
