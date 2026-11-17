// @vitest-environment jsdom
import { act, Profiler, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ReviewSelectionActionsSurface,
  ReviewSelectionActionsToolbar,
  useReviewSelectionActions,
} from './selection-actions';
import { ReviewInspectorSections, reviewInspectorActions } from './inspector-sections';
import { ReviewButton } from './controls';
it('keeps five fixed toolbar slots and routes guarded inspector commands into them', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const command = vi.fn();
  const interval = vi.fn();
  let disabled = false;
  function Fixture() {
    const [selected, select] = useState(false);
    return (
      <dialog open>
        <ReviewSelectionActionsSurface
          selection={selected ? { kind: 'edit', id: 'one' } : { kind: 'none' }}
          visible
          disabled={disabled}
          onSelectInterval={interval}
        >
          <div data-ui="gallery.videoReview.timeline">
            <div data-ui="gallery.videoReview.toolbar">
              <ReviewSelectionActionsToolbar />
            </div>
            <button data-review-removal-key="edit:one" onClick={() => select(true)}>
              Edit
            </button>
          </div>
          <ReviewInspectorSections
            sections={[
              reviewInspectorActions(
                <ReviewButton label="Remove" selectionAction="delete" onClick={command}>
                  Remove text
                </ReviewButton>
              ),
            ]}
          />
        </ReviewSelectionActionsSurface>
      </dialog>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    const panel = host.querySelector<HTMLFieldSetElement>(
      '[data-ui="gallery.videoReview.selectionActions"]'
    )!;
    const slots = [...panel.querySelectorAll('[data-selection-slot]')];
    expect(slots.map((slot) => slot.getAttribute('data-selection-slot'))).toEqual([
      'interval',
      'fragment',
      'duplicate',
      'reset',
      'delete',
    ]);
    expect(panel.disabled).toBe(false);
    expect([...panel.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    const item = host.querySelector<HTMLButtonElement>('[data-review-removal-key]')!;
    await act(async () => item.click());
    expect(host.querySelector('[data-ui="gallery.videoReview.selectionActions"]')).toBe(panel);
    expect([...panel.querySelectorAll('[data-selection-slot]')]).toEqual(slots);
    await act(async () => slots[0]!.querySelector<HTMLButtonElement>('button')!.click());
    expect(interval).toHaveBeenCalledWith([]);
    expect(panel.closest('[data-ui="gallery.videoReview.toolbar"]')).not.toBeNull();
    const remove = panel.querySelector<HTMLButtonElement>('button[aria-label="Remove"]')!;
    expect(remove.closest('[data-selection-slot]')?.getAttribute('data-selection-slot')).toBe(
      'delete'
    );
    await act(async () => remove.click());
    expect(command).toHaveBeenCalledOnce();
    disabled = true;
    await act(async () => root.render(<Fixture />));
    expect(panel.disabled).toBe(true);
    await act(async () => remove.click());
    expect(command).toHaveBeenCalledOnce();
    disabled = false;
    await act(async () => root.render(<Fixture />));
    await act(async () =>
      panel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(host.querySelector('[data-ui="gallery.videoReview.selectionActions"]')).toBe(panel);
    expect(panel.disabled).toBe(false);
    expect([...panel.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    expect(panel.querySelector('button[aria-label="Remove"]')).toBeNull();
    expect(
      host.querySelector('[data-section="actions"] button[aria-label="Remove"]')
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('anchors every supported selection identity and preserves ordered Ctrl and Shift selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  type Selection = import('../../features/video/review/types').ReviewSelection;
  let selected: Selection = { kind: 'none' };
  let disabled = false;
  let actions!: ReturnType<typeof useReviewSelectionActions>;
  const command = vi.fn();
  const choices: { selection: Selection; key: string }[] = [
    { selection: { kind: 'edit', id: 'a' }, key: 'edit:a' },
    { selection: { kind: 'edit', id: 'b' }, key: 'edit:b' },
    { selection: { kind: 'zoom', id: 'zoom' }, key: 'focus:zoom' },
    { selection: { kind: 'annotation-effect', id: 'annotation' }, key: 'annotation:annotation' },
    { selection: { kind: 'text', id: 'text' }, key: 'text:text' },
    { selection: { kind: 'audio', lane: 'music', id: 'music' }, key: 'audio:music' },
    { selection: { kind: 'original-audio', id: 'original' }, key: 'original-audio:original' },
    {
      selection: { kind: 'telemetry', ref: { kind: 'action', id: 'click' } },
      key: 'telemetry:action:click',
    },
    { selection: { kind: 'cursor-motion', id: 'cursor' }, key: 'cursor-motion:cursor' },
    { selection: { kind: 'cursor-focus', id: 'point', time: 0 }, key: 'cursor-focus:point' },
    { selection: { kind: 'zoom-link', id: 'link' }, key: 'zoom-link:link' },
    { selection: { kind: 'webcam-position', id: 'position' }, key: 'webcam-position:position' },
    { selection: { kind: 'webcam-hidden', id: 'hidden' }, key: 'webcam-hidden:hidden' },
  ];
  function Fixture() {
    actions = useReviewSelectionActions(selected, true, disabled, command);
    return (
      <dialog open>
        <div
          data-ui="gallery.videoReview.timeline"
          onPointerDownCapture={(event) => {
            actions.capture(event);
            actions.multiSelection.captureModified(event);
          }}
        >
          <div data-review-track="source">
            {choices.map(({ key }, index) => (
              <button
                key={key}
                data-review-removal-key={index === 9 ? undefined : key}
                data-cursor-focus-key={index === 9 ? 'point' : undefined}
                data-choice={key}
              >
                {key}
              </button>
            ))}
            <div data-playback-range-edge="start" />
          </div>
        </div>
      </dialog>
    );
  }
  const render = () => act(() => root.render(<Fixture />));
  const pointer = (index: number, options: MouseEventInit = {}) =>
    act(() =>
      host
        .querySelectorAll('button')
        [index]!.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, ...options })
        )
    );
  const visible = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue({ length: 1 } as DOMRectList);
  try {
    for (const [index, choice] of choices.entries()) {
      selected = choice.selection;
      render();
      pointer(index);
      expect(actions.target?.key).toBe(choice.key);
    }
    selected = { kind: 'none' };
    render();
    pointer(0);
    expect(actions.target).toBeNull();
    selected = choices[0]!.selection;
    render();
    pointer(0);
    act(() => actions.capture({ target: host.querySelector('[data-playback-range-edge]')! }));
    expect(actions.target?.key).toBe('edit:a');
    pointer(1, { ctrlKey: true });
    expect(actions.multiSelection.keys).toEqual(['edit:a', 'edit:b']);
    expect(host.querySelectorAll('[data-review-multi-selected]')).toHaveLength(2);
    pointer(2, { shiftKey: true });
    expect(actions.multiSelection.keys).toContain('focus:zoom');
    pointer(1, { metaKey: true });
    expect(actions.multiSelection.keys).not.toContain('edit:b');
    pointer(0, { ctrlKey: true });
    expect(actions.multiSelection.keys.length).toBeGreaterThan(1);
    const groupAnchor = actions.target?.key;
    expect(groupAnchor).toBeTruthy();
    selected = choices.find((choice) => choice.key === groupAnchor)!.selection;
    render();
    expect(actions.target?.key).toBe(groupAnchor);
    selected = { kind: 'none' };
    render();
    expect(actions.target?.key).toBe(groupAnchor);
    selected = choices[0]!.selection;
    render();
    disabled = true;
    render();
    const before = actions.multiSelection.keys;
    pointer(3, { ctrlKey: true });
    expect(actions.multiSelection.keys).toEqual(before);
    act(() => actions.multiSelection.clear());
    expect(actions.multiSelection.keys).toEqual([]);
    expect(actions.target?.key).toBe('edit:a');
    act(() =>
      actions.capture({ target: host.querySelector('[data-ui="gallery.videoReview.timeline"]')! })
    );
    expect(actions.target).toBeNull();
    expect(command).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    visible.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('keeps fragment active for an interval without a selected object, including outside properties', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const download = vi.fn();
  let busy = false;
  const render = () =>
    act(async () =>
      root.render(
        <ReviewSelectionActionsSurface
          selection={{ kind: 'none' }}
          visible={false}
          disabled={busy}
          fragmentAction={() => (
            <ReviewButton label="Fragment" onClick={download}>
              Download
            </ReviewButton>
          )}
        >
          <ReviewSelectionActionsToolbar />
        </ReviewSelectionActionsSurface>
      )
    );
  try {
    await render();
    const button = host.querySelector<HTMLButtonElement>(
      '[data-selection-slot="fragment"] button'
    )!;
    await act(async () => button.click());
    expect(download).toHaveBeenCalledOnce();
    expect(
      host.querySelector<HTMLButtonElement>('[data-selection-slot="interval"] button')!.disabled
    ).toBe(true);
    busy = true;
    await render();
    await act(async () => button.click());
    expect(download).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('publishes the canonical selected key in its first and only selection commit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let selected = 'first';
  let actions!: ReturnType<typeof useReviewSelectionActions>;
  const commits = vi.fn();
  const renders = vi.fn();
  const targets: (string | null)[] = [];
  function Fixture() {
    renders();
    actions = useReviewSelectionActions({ kind: 'zoom', id: selected }, true, false);
    const key = actions.target?.key ?? null;
    useLayoutEffect(() => {
      targets.push(key);
    });
    return (
      <div data-ui="gallery.videoReview.timeline">
        <button data-review-action-key={`focus:${selected}`} />
      </div>
    );
  }
  const render = () =>
    act(() =>
      root.render(
        <Profiler id="selection-actions" onRender={commits}>
          <Fixture />
        </Profiler>
      )
    );
  try {
    render();
    commits.mockClear();
    targets.length = 0;
    renders.mockClear();
    selected = 'second';
    render();
    expect.soft(renders).toHaveBeenCalledTimes(1);
    expect.soft(targets[0]).toBe('focus:second');
    expect.soft(commits).toHaveBeenCalledTimes(1);
    const target = actions.target;
    commits.mockClear();
    targets.length = 0;
    const item = host.querySelector('button')!;
    act(() => actions.capture({ target: item }));
    act(() => actions.capture({ target: item }));
    act(() => actions.multiSelection.clear());
    expect.soft(actions.target).toBe(target);
    expect(commits).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('scopes dismissal to its selection and restores commands through reselect and visibility changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let selection: import('../../features/video/review/types').ReviewSelection = {
    kind: 'zoom',
    id: 'first',
  };
  let visible = true;
  let disabled = false;
  let actions!: ReturnType<typeof useReviewSelectionActions>;
  function Fixture() {
    actions = useReviewSelectionActions(selection, visible, disabled);
    return (
      <div data-ui="gallery.videoReview.timeline">
        <button data-review-action-key="focus:first" />
        <button data-review-action-key="focus:second" />
        <div data-playback-range-edge="start" />
        <div data-ui="gallery.videoReview.toolbar">
          <button data-review-action-key="toolbar" />
        </div>
      </div>
    );
  }
  const render = () => act(() => root.render(<Fixture />));
  try {
    render();
    expect(actions.target?.key).toBe('focus:first');
    act(() => actions.target?.dismiss());
    expect(actions.target).toBeNull();
    render();
    expect(actions.target).toBeNull();
    act(() =>
      actions.capture({ target: host.querySelector('[data-review-action-key="focus:first"]')! })
    );
    expect(actions.target?.key).toBe('focus:first');
    act(() => actions.target?.dismiss());
    selection = { kind: 'zoom', id: 'second' };
    render();
    expect(actions.target?.key).toBe('focus:second');
    selection = { kind: 'zoom', id: 'first' };
    render();
    expect(actions.target?.key).toBe('focus:first');
    act(() => actions.target?.dismiss());
    visible = false;
    render();
    expect(actions.target).toBeNull();
    visible = true;
    disabled = true;
    render();
    expect(actions.target?.key).toBe('focus:first');
    expect(actions.target?.disabled).toBe(true);
    const target = actions.target;
    act(() => actions.capture({ target: host.querySelector('[data-playback-range-edge]')! }));
    act(() =>
      actions.capture({ target: host.querySelector('[data-review-action-key="toolbar"]')! })
    );
    act(() =>
      actions.capture({
        target: host.querySelector('[data-review-action-key="focus:second"]')!,
        button: 2,
      })
    );
    expect(actions.target).toBe(target);
    selection = { kind: 'none' };
    render();
    expect(actions.target).toBeNull();
    visible = false;
    selection = { kind: 'zoom', id: 'second' };
    render();
    expect(actions.target).toBeNull();
    visible = true;
    render();
    expect(actions.target?.key).toBe('focus:second');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
