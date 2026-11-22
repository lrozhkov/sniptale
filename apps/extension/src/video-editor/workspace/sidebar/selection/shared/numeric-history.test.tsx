// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../../features/video/project/factories/overlay-clip';
import { useVideoEditorStore } from '../../../../state/store';
import { InspectorNumericHistoryProvider } from './numeric-history';
import { SliderField } from './sliders';
import { ClipFadeFields } from '../inputs/clip-timing';
import { isHydratableVideoProject } from '../../../../../features/video/project/validation/root';
import { NumberInput } from '../inputs/number';

let host: HTMLDivElement;
let root: Root;
let clipId: string;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject('Numeric history');
  const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
  clip.style.fontSize = 40;
  clipId = clip.id;
  project.clips = [clip];
  project.duration = clip.duration;
  useVideoEditorStore.getState().setProject(project);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function currentSize() {
  const clip = useVideoEditorStore.getState().project?.clips.find((entry) => entry.id === clipId);
  if (clip?.type !== 'TEXT') throw new Error('Missing text clip');
  return clip.style.fontSize;
}
function Field({
  kind,
  disabled = false,
  onCommit,
  scrub = false,
}: {
  kind: 'slider' | 'number';
  disabled?: boolean;
  scrub?: boolean;
  onCommit?: () => void;
}) {
  const project = useVideoEditorStore((state) => state.project);
  const clip = project?.clips.find((entry) => entry.id === clipId);
  if (clip?.type !== 'TEXT') return null;
  const props = {
    disabled,
    label: 'Size',
    value: clip.style.fontSize,
    min: 1,
    max: 160,
    onChange: (fontSize: number) =>
      useVideoEditorStore.getState().updateTextClipStyle(clipId, { fontSize }),
  };
  return kind === 'slider' ? (
    <SliderField {...props} />
  ) : (
    <NumberInput {...props} scrub={scrub} {...(onCommit ? { onCommit } : {})} />
  );
}
async function pointer(type: string, label = 'Size') {
  const target = host.querySelector(`[aria-label="${label} increase"]`);
  if (!target) throw new Error('Missing numeric stepper');
  await act(async () =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
  );
}
async function repeat() {
  for (const elapsed of [220, 70, 70]) await act(async () => vi.advanceTimersByTimeAsync(elapsed));
}
it.each(['slider', 'number'] as const)(
  'groups %s live previews into separate completed actions',
  async (kind) => {
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} />
        </InspectorNumericHistoryProvider>
      )
    );
    await pointer('pointerdown');
    await repeat();
    expect(currentSize()).toBe(43);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    await pointer('pointerup');
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
    await pointer('pointerdown');
    await pointer('pointerup');
    expect(currentSize()).toBe(44);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(currentSize()).toBe(43);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(currentSize()).toBe(40);
    act(() => useVideoEditorStore.getState().redoProject());
    expect(currentSize()).toBe(43);
    act(() => useVideoEditorStore.getState().redoProject());
    expect(currentSize()).toBe(44);
  }
);

for (const kind of ['slider', 'number'] as const) {
  it.each(['Escape', 'undo shortcut', 'pointercancel', 'unmount', 'disabled'])(
    `cancels %s for ${kind} without a new action or lost Redo`,
    async (reason) => {
      act(() => {
        useVideoEditorStore.getState().renameProject('Redo name');
        useVideoEditorStore.getState().undoProject();
        root.render(
          <InspectorNumericHistoryProvider>
            <Field kind={kind} />
          </InspectorNumericHistoryProvider>
        );
      });
      await pointer('pointerdown');
      await repeat();
      expect(currentSize()).toBe(43);
      if (reason === 'pointercancel') await pointer('pointercancel');
      else if (reason === 'unmount') act(() => root.render(null));
      else if (reason === 'disabled')
        act(() =>
          root.render(
            <InspectorNumericHistoryProvider>
              <Field kind={kind} disabled />
            </InspectorNumericHistoryProvider>
          )
        );
      else
        act(() =>
          window.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: reason === 'Escape' ? 'Escape' : 'z',
              ctrlKey: reason !== 'Escape',
              bubbles: true,
              cancelable: true,
            })
          )
        );
      expect(currentSize()).toBe(40);
      const state = useVideoEditorStore.getState();
      expect(state.projectHistory.transaction).toBeNull();
      expect(state.projectHistory.past).toHaveLength(0);
      expect(state.projectHistory.future).toHaveLength(1);
      act(() => state.redoProject());
      expect(useVideoEditorStore.getState().project?.name).toBe('Redo name');
      expect(currentSize()).toBe(40);
    }
  );

  it(`refuses a foreign history lease for ${kind} and permits a later retry`, async () => {
    const foreign = useVideoEditorStore.getState().beginProjectHistoryTransaction();
    if (!foreign) throw new Error('Missing foreign lease');
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} />
        </InspectorNumericHistoryProvider>
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Size increase"]')!;
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(currentSize()).toBe(40);
    expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(foreign)).toBe(true);
    act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(foreign));
    await pointer('pointerdown');
    await pointer('pointerup');
    expect(currentSize()).toBe(41);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  });

  it(`does not apply the final ${kind} value after begin refusal`, async () => {
    const begin = useVideoEditorStore.getState().beginProjectHistoryTransaction;
    useVideoEditorStore.setState({
      beginProjectHistoryTransaction: vi.fn().mockReturnValueOnce(null).mockImplementation(begin),
    });
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} />
        </InspectorNumericHistoryProvider>
      )
    );
    await pointer('pointerdown');
    await pointer('pointerup');
    expect(currentSize()).toBe(40);
    expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('40');
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    await pointer('pointerdown');
    await pointer('pointerup');
    expect(currentSize()).toBe(41);
  });

  it(`does not restore an old ${kind} into a replacement project`, async () => {
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} />
        </InspectorNumericHistoryProvider>
      )
    );
    await pointer('pointerdown');
    await repeat();
    const replacement = createEmptyVideoProject('Replacement');
    act(() => useVideoEditorStore.getState().setProject(replacement));
    act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
    expect(useVideoEditorStore.getState().project?.id).toBe(replacement.id);
    expect(useVideoEditorStore.getState().project?.clips).toEqual([]);
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  });
}

for (const kind of ['slider', 'number'] as const) {
  it(`keeps one ${kind} range gesture and removes a return-to-origin action`, async () => {
    act(() => {
      useVideoEditorStore.getState().renameProject('Redo name');
      useVideoEditorStore.getState().undoProject();
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} scrub />
        </InspectorNumericHistoryProvider>
      );
    });
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    const preview = (value: number) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          range,
          String(value)
        );
        range.dispatchEvent(new Event('input', { bubbles: true }));
      });
    act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    preview(80);
    preview(90);
    preview(40);
    act(() => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
    expect(currentSize()).toBe(40);
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
    act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    preview(70);
    preview(80);
    preview(90);
    expect(currentSize()).toBe(90);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    act(() => range.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(0);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(currentSize()).toBe(40);
    act(() => useVideoEditorStore.getState().redoProject());
    expect(currentSize()).toBe(90);
  });
  it(`groups a ${kind} range key repeat until key release`, async () => {
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} scrub />
        </InspectorNumericHistoryProvider>
      )
    );
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    for (let index = 0; index < 3; index++)
      act(() =>
        range.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            repeat: index > 0,
            bubbles: true,
            cancelable: true,
          })
        )
      );
    expect(currentSize()).toBe(43);
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    act(() =>
      range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    );
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(currentSize()).toBe(40);
  });
}

it('cancels the complete transferred fade edit without losing its clock or Redo', async () => {
  const state = useVideoEditorStore.getState();
  const project = state.project!;
  const playbackWindow = {
    offset: 0.5,
    holdAt: 3,
    fadePhase: { offset: 0.5, duration: 4 },
    gainPhase: { offset: 0.5, duration: 4 },
  };
  const prepared = {
    ...project,
    version: 43 as const,
    clips: project.clips.map((clip) => ({ ...clip, playbackWindow })),
  };
  expect(isHydratableVideoProject(prepared)).toBe(true);
  state.setProject(prepared);
  useVideoEditorStore.getState().renameProject('Redo fade');
  useVideoEditorStore.getState().undoProject();
  function Fades() {
    const clip = useVideoEditorStore((current) => current.project?.clips[0]);
    if (!clip) return null;
    return (
      <ClipFadeFields
        clipId={clip.id}
        duration={clip.duration}
        fadeInMs={clip.fadeInMs}
        fadeOutMs={clip.fadeOutMs}
        locked={false}
        onUpdateClipFades={useVideoEditorStore.getState().updateClipFades}
      />
    );
  }
  act(() =>
    root.render(
      <InspectorNumericHistoryProvider>
        <Fades />
      </InspectorNumericHistoryProvider>
    )
  );
  const label = host
    .querySelector<HTMLInputElement>('input[type="text"]')!
    .getAttribute('aria-label')!;
  await pointer('pointerdown', label);
  await repeat();
  expect(
    useVideoEditorStore.getState().project?.clips[0]?.playbackWindow?.fadePhase
  ).toBeUndefined();
  act(() =>
    globalThis.window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(useVideoEditorStore.getState().project?.clips[0]?.fadeInMs).toBe(0);
  expect(useVideoEditorStore.getState().project?.clips[0]?.playbackWindow).toEqual(playbackWindow);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
});

it.each(['slider', 'number'] as const)(
  'cancels a disabled range for %s and closes its completion owner',
  (kind) => {
    const finish = vi.fn();
    act(() => {
      useVideoEditorStore.getState().renameProject('Redo name');
      useVideoEditorStore.getState().undoProject();
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} scrub onCommit={finish} />
        </InspectorNumericHistoryProvider>
      );
    });
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => range.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '90');
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(currentSize()).toBe(90);
    expect(useVideoEditorStore.getState().projectHistory.transaction).not.toBeNull();
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} scrub disabled onCommit={finish} />
        </InspectorNumericHistoryProvider>
      )
    );
    expect(currentSize()).toBe(40);
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
    if (kind === 'number') expect(finish).toHaveBeenCalledOnce();
  }
);

it.each(['slider', 'number'] as const)(
  'keeps a subsequent field edit after Tab leaves a %s hold',
  async (kind) => {
    const finish = vi.fn();
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Field kind={kind} onCommit={finish} />
        </InspectorNumericHistoryProvider>
      )
    );
    await pointer('pointerdown');
    await repeat();
    expect(currentSize()).toBe(43);
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })
      )
    );
    if (kind === 'number') expect(finish).toHaveBeenCalledOnce();
    act(() => useVideoEditorStore.getState().renameProject('Next field edit'));
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(useVideoEditorStore.getState().project?.name).toBe('Next field edit');
    expect(currentSize()).toBe(43);
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  }
);

it.each(['slider', 'number'] as const)(
  'accepts the previous numeric draft before a different %s hold',
  async (kind) => {
    function Pair() {
      const clip = useVideoEditorStore((state) => state.project?.clips[0]);
      if (clip?.type !== 'TEXT') return null;
      const Control = kind === 'slider' ? SliderField : NumberInput;
      return (
        <>
          <Control
            label="Size"
            value={clip.style.fontSize}
            min={10}
            max={160}
            onChange={(fontSize) =>
              useVideoEditorStore.getState().updateTextClipStyle(clip.id, { fontSize })
            }
          />
          <Control
            label="Weight"
            value={clip.style.fontWeight}
            min={100}
            max={900}
            step={100}
            onChange={(fontWeight) =>
              useVideoEditorStore.getState().updateTextClipStyle(clip.id, { fontWeight })
            }
          />
        </>
      );
    }
    act(() =>
      root.render(
        <InspectorNumericHistoryProvider>
          <Pair />
        </InspectorNumericHistoryProvider>
      )
    );
    const size = host.querySelector<HTMLInputElement>('input[aria-label="Size"]')!;
    act(() => {
      size.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(size, '60');
      size.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(currentSize()).toBe(40);
    await pointer('pointerdown', 'Weight');
    if (document.activeElement === size) act(() => size.blur());
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(currentSize()).toBe(60);
    expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(currentSize()).toBe(40);
  }
);
