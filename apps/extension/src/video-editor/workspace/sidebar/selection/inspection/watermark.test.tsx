// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createQuickEditWatermark } from '../../../../../features/video/project/scene/watermark';
import { useVideoEditorStore } from '../../../../state/store';
import type { VideoEditorWatermarkInspectorRuntime } from '../../../../contracts/workspace';
import type { PreviewStageImportHandlers } from '../../../../contracts/insertion';
import * as shared from '../../../../../ui/watermark/inspector';
import { SceneWatermarkFields } from './watermark';

type PickerProps = Parameters<
  typeof import('../../../../../composition/background-resources/picker').BackgroundImagePicker
>[0];
const picker = vi.hoisted(() => ({ props: undefined as PickerProps | undefined }));
vi.mock('../../../../../composition/background-resources/picker', () => ({
  BackgroundImagePicker: (props: PickerProps) => {
    picker.props = props;
    return null;
  },
}));
vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: Root;
let abort: (() => void) | undefined;
let runtime: VideoEditorWatermarkInspectorRuntime;
let importImage: ReturnType<typeof vi.fn<PreviewStageImportHandlers['image']>>;
const initial = useVideoEditorStore.getInitialState();
function Harness() {
  const project = useVideoEditorStore((state) => state.project)!;
  return <SceneWatermarkFields project={project} runtime={runtime} onImportImage={importImage} />;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  useVideoEditorStore.setState(initial, true);
  const project = createEmptyVideoProject('Original');
  project.watermark = { ...createQuickEditWatermark('Saved'), mode: 'text' };
  project.version = 20;
  useVideoEditorStore.getState().setProject(project);
  abort = undefined;
  runtime = {
    onPreview: vi.fn(),
    registerAbort: (callback) => {
      abort = callback;
      return () => {
        if (abort === callback) abort = undefined;
      };
    },
  };
  importImage = vi.fn(async () => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(shared, 'WatermarkInspector');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  picker.props = undefined;
});
async function mount(strict = false) {
  await act(async () =>
    root.render(
      strict ? (
        <StrictMode>
          <Harness />
        </StrictMode>
      ) : (
        <Harness />
      )
    )
  );
}
async function text(value: string) {
  const node = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return node;
}
async function key(node: HTMLElement, value: string) {
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
  );
}
function props() {
  return vi.mocked(shared.WatermarkInspector).mock.lastCall![0];
}

it('keeps text preview outside history and commits Enter once with Undo and Redo', async () => {
  await mount();
  const original = useVideoEditorStore.getState().project!;
  const node = await text('Draft');
  expect(useVideoEditorStore.getState().project).toBe(original);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  expect(runtime.onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      project: original,
      settings: expect.objectContaining({ text: expect.objectContaining({ value: 'Draft' }) }),
    })
  );
  await key(node, 'Enter');
  expect(useVideoEditorStore.getState().project!.watermark!.text.value).toBe('Draft');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  await act(async () => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  await act(async () => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.watermark!.text.value).toBe('Saved');
  await act(async () => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.watermark!.text.value).toBe('Draft');
});

it('accepts editing after StrictMode effect replay', async () => {
  await mount(true);
  const node = await text('Replayed');
  await key(node, 'Enter');
  expect(useVideoEditorStore.getState().project!.watermark!.text.value).toBe('Replayed');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
});

it('discards Escape and ignores composing Enter without accepted history', async () => {
  await mount();
  const node = await text('Transient');
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
    )
  );
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  await key(node, 'Escape');
  expect(node.value).toBe('Saved');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  expect(runtime.onPreview).toHaveBeenLastCalledWith(null);
});

it('preserves a parallel rename but refuses a stale competing watermark and avoids no-op history', async () => {
  await mount();
  const stale = props().onChange;
  const settings = useVideoEditorStore.getState().project!.watermark!;
  await act(async () => useVideoEditorStore.getState().renameProject('Renamed'));
  let accepted = false;
  await act(async () => {
    accepted = await stale({ ...settings, text: { ...settings.text, value: 'Accepted' } });
  });
  expect(accepted).toBe(true);
  expect(useVideoEditorStore.getState().project!.name).toBe('Renamed');
  const count = useVideoEditorStore.getState().projectHistory.past.length;
  await act(async () => {
    accepted = await stale({ ...settings, layout: 'tiled' });
  });
  expect(accepted).toBe(false);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(count);
  await act(async () => {
    accepted = await props().onChange(
      structuredClone(useVideoEditorStore.getState().project!.watermark!)
    );
  });
  expect(accepted).toBe(true);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(count);
});

it('invalidates old same-ID handlers and drafts before the project is reloaded', async () => {
  await mount();
  const stale = props().onChange;
  const settings = useVideoEditorStore.getState().project!.watermark!;
  await text('Discard on leave');
  await act(async () => {
    abort!();
    useVideoEditorStore
      .getState()
      .setProject(structuredClone(useVideoEditorStore.getState().project!));
  });
  expect(host.querySelector('textarea')!.value).toBe('Saved');
  let accepted = true;
  await act(async () => {
    accepted = await stale({ ...settings, layout: 'tiled' });
  });
  expect(accepted).toBe(false);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('passes private acquisition origin and cancels late completion when the inspector leaves', async () => {
  await mount();
  let finish!: () => void;
  importImage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pick = props().onImage;
  let pending!: Promise<void>;
  await act(async () => {
    pending = pick(new File(['logo'], 'logo.png'), 'library-origin');
  });
  const signal = importImage.mock.calls[0]![1]!;
  expect(signal.destination).toBe('watermark');
  if (signal.destination !== 'watermark') throw new Error('Expected watermark acquisition.');
  expect(signal.watermarkOriginMediaId).toBe('library-origin');
  expect(props().pending).toBe(true);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => {
    abort!();
    finish();
    await rejected;
  });
  expect(signal.signal.aborted).toBe(true);
  expect(props().pending).toBe(false);
  expect(props().error).toBeNull();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('cancels on unmount and permits a fresh acquisition after a failed attempt', async () => {
  await mount();
  importImage.mockRejectedValueOnce(new Error('Read failed'));
  await act(async () => {
    await expect(props().onImage(new File(['a'], 'a.png'))).rejects.toThrow('Read failed');
  });
  expect(props().pending).toBe(false);
  expect(props().error).not.toBeNull();
  await act(async () => {
    await props().onImage(new File(['b'], 'b.png'));
  });
  expect(importImage).toHaveBeenCalledTimes(2);
  expect(props().error).toBeNull();
  let finish!: () => void;
  importImage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = props().onImage(new File(['c'], 'c.png'));
  });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => root.render(null));
  await act(async () => {
    finish();
    await rejected;
  });
  expect(abort).toBeUndefined();
});

it('registers a fresh cancellation owner after a leave reset for acquisitions started during loading', async () => {
  await mount();
  const first = abort!;
  await act(async () => first());
  expect(abort).not.toBe(first);
  let finish!: () => void;
  importImage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = props().onImage(new File(['logo'], 'during-load.png'));
  });
  const placement = importImage.mock.calls[0]![1]!;
  if (placement.destination !== 'watermark') throw new Error('Expected watermark acquisition.');
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => {
    abort!();
    finish();
    await rejected;
  });
  expect(placement.signal.aborted).toBe(true);
  expect(props().pending).toBe(false);
  expect(props().error).toBeNull();
});

it('forwards picker cancellation without publishing an error or keeping the inspector busy', async () => {
  await mount();
  let finish!: () => void;
  importImage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pickerSignal = new AbortController();
  let pending!: Promise<void>;
  await act(async () => {
    pending = props().onImage(new File(['logo'], 'picker.png'), undefined, pickerSignal.signal);
  });
  const placement = importImage.mock.calls[0]![1]!;
  if (placement.destination !== 'watermark') throw new Error('Expected watermark acquisition.');
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => {
    pickerSignal.abort();
    finish();
    await rejected;
  });
  expect(placement.signal.aborted).toBe(true);
  expect(props().pending).toBe(false);
  expect(props().error).toBeNull();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});
