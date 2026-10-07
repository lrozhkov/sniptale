// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSelectedProperties, reviewSelectionLabel } from './selected-properties';
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
  ColorField: (props: { label: string; value: string; onChange(value: string): void }) => (
    <input
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
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

it('commits an opaque custom transition color through the existing edit command', async () => {
  const view = mount({ type: 'fade-black', before: 0.5, after: 0.5 });
  const input = view.host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.cutTransitionColor"]'
  )!;
  expect(input.value).toBe('#000000');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '#1248a0'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(view.change).toHaveBeenLastCalledWith({
    type: 'fade-black',
    before: 0.5,
    after: 0.5,
    color: '#1248a0',
  });
  expect(view.edit.transition?.color).toBe('#1248a0');
});

it('keeps inspector titles specific to the selected lane and focus type', () => {
  type State = Parameters<typeof reviewSelectionLabel>[0];
  const state = {
    markers: [],
    advanced: {
      zoom: {
        regions: [{ id: 'border', border: {} }, { id: 'spotlight', spotlight: {} }, { id: 'zoom' }],
      },
    },
    editing: { selected: { kind: 'cut' } },
  };
  const cases = [
    [{ kind: 'webcam' }, 'webcam'],
    [{ kind: 'webcam-position' }, 'webcam'],
    [{ kind: 'webcam-hidden' }, 'webcam'],
    [{ kind: 'zoom', id: 'border' }, 'focusBorder'],
    [{ kind: 'zoom', id: 'spotlight' }, 'focusSpotlight'],
    [{ kind: 'zoom', id: 'zoom' }, 'zoomRegionLabel'],
    [{ kind: 'zoom', id: 'missing' }, 'zoomRegionLabel'],
    [{ kind: 'zoom-link' }, 'zoomLinkSettings'],
    [{ kind: 'canvas-comment' }, 'overlayComments'],
    [{ kind: 'original-audio' }, 'originalAudioRange'],
    [{ kind: 'audio', lane: 'voiceover' }, 'audioVoiceover'],
    [{ kind: 'audio', lane: 'music' }, 'audioMusic'],
    [{ kind: 'edit', id: 'cut' }, 'cutLabel'],
  ] as const;
  for (const [selection, label] of cases)
    expect(reviewSelectionLabel({ ...state, selection } as unknown as State)).toBe(
      `gallery.videoReview.${label}`
    );
  expect(
    reviewSelectionLabel({ ...state, selection: { kind: 'none' } } as unknown as State)
  ).toBeUndefined();
  expect(
    reviewSelectionLabel({
      ...state,
      selection: { kind: 'edit' },
      editing: { selected: { kind: 'speed' } },
    } as unknown as State)
  ).toBe('gallery.videoReview.speedMode');
});

it('resolves an action title by its full reference and tolerates a missing selection', () => {
  type State = Parameters<typeof reviewSelectionLabel>[0];
  const state = {
    markers: [
      { ref: { kind: 'cursor', id: 'one' }, eventType: 'cursor' },
      { ref: { kind: 'action', id: 'other' }, eventType: 'KEY' },
      { ref: { kind: 'action', id: 'one' }, eventType: 'CLICK' },
    ],
    selection: { kind: 'telemetry', ref: { kind: 'action', id: 'one' } },
  } as unknown as State;
  expect(reviewSelectionLabel(state)).toBe('gallery.videoReview.eventClick');
  expect(reviewSelectionLabel({ ...state, markers: [] })).toBe('gallery.videoReview.telemetry');
  expect(
    reviewSelectionLabel({
      ...state,
      selection: { kind: 'edit', id: 'missing' },
      editing: {},
    } as State)
  ).toBeUndefined();
});
