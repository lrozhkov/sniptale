// @vitest-environment jsdom
import { TextEncoder as NodeTextEncoder } from 'node:util';
import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { DB_VERSION } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import { createCursorTrajectoryBlockPacker } from '../../features/video/project/cursor-trajectory/blocks';
import { createReviewRecordingHistoryProject } from '../../workflows/video-review/recording-review';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { useReviewZoomEditor } from './zoom-editor';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { RecordingCursorTrajectoryStoreDependencies } from '../../composition/persistence/recordings/cursor-trajectory/contracts';
import type { CursorTrajectoryDescriptor } from '../../features/video/project/cursor-trajectory/types';
import type { CompositionJoinSettings } from '../../features/video/project/scene/composition-join';
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewSelectedProperties, reviewSelectionLabel } from './selected-properties';
import type { ReviewEdit } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const archive = vi.hoisted(() => ({
  dependencies: undefined as RecordingCursorTrajectoryStoreDependencies | undefined,
  mini: vi.fn<(props: ComponentProps<typeof import('./zoom-preview').ReviewZoomPreview>) => void>(),
  results: [] as boolean[],
  availabilityOwners: 0,
  historyOwners: 0,
  historyReads: 0,
  override: undefined as
    | ReturnType<
        typeof import('../../workflows/video-review/cursor-trajectory').createRecordingCursorAvailabilityReader
      >['available']
    | undefined,
  calls: [] as Parameters<
    ReturnType<
      typeof import('../../workflows/video-review/cursor-trajectory').createRecordingCursorAvailabilityReader
    >['available']
  >[],
}));
vi.mock('../../workflows/video-review/cursor-trajectory', async (original) => {
  const actual = await original<typeof import('../../workflows/video-review/cursor-trajectory')>();
  return {
    ...actual,
    createRecordingCursorAvailabilityReader: () => {
      archive.availabilityOwners++;
      const reader = actual.createRecordingCursorAvailabilityReader(archive.dependencies);
      return {
        ...reader,
        available: (...args: Parameters<typeof reader.available>) => {
          archive.calls.push(args);
          return (archive.override ? archive.override(...args) : reader.available(...args)).then(
            (value) => {
              archive.results.push(value);
              return value;
            }
          );
        },
      };
    },
  };
});
vi.mock('../../workflows/video-review/recording-review', async (original) => {
  const actual = await original<typeof import('../../workflows/video-review/recording-review')>();
  return {
    ...actual,
    createReviewRecordingHistorySource: (
      ...args: Parameters<typeof actual.createReviewRecordingHistorySource>
    ) => {
      archive.historyOwners++;
      const reader = actual.createReviewRecordingHistorySource(
        args[0],
        args[1],
        archive.dependencies,
        args[3]
      );
      return {
        ...reader,
        read: (...readArgs: Parameters<typeof reader.read>) => {
          archive.historyReads++;
          return reader.read(...readArgs);
        },
      };
    },
  };
});
vi.mock('./zoom-preview', () => ({
  ReviewZoomPreview: (props: ComponentProps<typeof import('./zoom-preview').ReviewZoomPreview>) => {
    archive.mini(props);
    return null;
  },
}));
vi.mock('./use-zoom-preview-source', () => ({ useZoomPreviewSource: () => null }));
vi.mock('./edit-range-fields', () => ({ ReviewEditRangeFields: () => null }));
vi.mock('./controls', async (original) => ({
  ...(await original<typeof import('./controls')>()),
  ReviewDetails: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// Real control focus/Escape/blur is covered in the browser. This adapter exercises
// the inspector's draft, coupled values and asynchronous commit boundary directly.
vi.mock('../../ui/compact-inspector-controls', async (original) => ({
  ...(await original<typeof import('../../ui/compact-inspector-controls')>()),
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
afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  archive.dependencies = undefined;
  archive.mini.mockClear();
  archive.override = undefined;
  archive.calls.length = 0;
  archive.results.length = 0;
  archive.availabilityOwners = archive.historyOwners = archive.historyReads = 0;
  installPersistenceLockManagerForTests(null);
  for (const database of databases.splice(0)) {
    database.db.close();
    await deleteDB(database.name);
  }
});
function mount(transition?: CompositionJoinSettings) {
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
  const change = vi.fn<(value: CompositionJoinSettings | null) => Promise<boolean>>(
    async (value) => {
      if (value) edit.transition = value;
      else delete edit.transition;
      return true;
    }
  );
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
    [{ kind: 'text', id: 'text' }, 'textFragment'],
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

const databases: { name: string; db: IDBPDatabase }[] = [];
let sequence = 0;
async function desktopArchive() {
  // The fake IndexedDB structured clone uses Node typed arrays in this mounted DOM test.
  vi.stubGlobal('Uint8Array', new NodeTextEncoder().encode('').constructor);
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  const name = `desktop-selected-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  archive.dependencies = {
    database: async () => db,
    mintGeneration: () => `generation-${sequence}`,
  };
  const identity = { recordingId: 'desktop-recording', trajectoryId: 'c'.repeat(32) };
  const source = {
    width: 2560,
    height: 1440,
    duration: 26.283316666666664,
    size: 10,
    mimeType: 'video/mp4',
  };
  const store = createRecordingCursorTrajectoryStore(archive.dependencies),
    writer = await store.begin(identity, { width: source.width, height: source.height });
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = [
    ...packer.append({
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      reason: 'start',
      width: source.width,
      height: source.height,
      clock: {
        source: 'windows-message-time',
        timestampQuantumUs: 1000,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    }),
  ];
  for (const [observationSeq, time, x, y] of [
    [0, 2.5, 688, 202],
    [1, 4.2, 1230, 698],
    [2, 6.7, 900, 300],
  ])
    blocks.push(
      ...packer.append({
        kind: 'sample',
        segmentId: 0,
        observationSeq: observationSeq!,
        activeTimeUs: Math.round(time! * 1e6),
        xQ8: x! * 256,
        yQ8: y! * 256,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
  blocks.push(
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 26303162, reason: 'stop' }),
    ...packer.finish()
  );
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, packer.summary(), 'complete');
  const cursorTrajectory: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...packer.summary(),
  };
  const telemetry: RecordingTelemetryEntry = {
    recordingId: identity.recordingId,
    captureMode: 'SCREEN',
    displaySurface: 'monitor',
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    createdAt: 1,
    updatedAt: 1,
    viewport: { width: 2560, height: 1440, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    cursorTrajectory,
  };
  const project = createReviewRecordingHistoryProject(telemetry, source, 'desktop.mp4');
  if (!project) throw Error('Missinghistoryproject');
  return { source, telemetry, project, store, identity };
}
async function mountDesktop(options: { retired?: boolean; playback?: boolean } = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const data = await desktopArchive();
  if (options.retired) await data.store.retire(data.identity);
  const initial = createQuickEditZoomRegion({
    id: 'desktop-zoom',
    at: 2.48433516957656,
    duration: 4.335718703592214,
  });
  let advanced = {
    ...createQuickEditAdvancedState(),
    ui: {
      ...createQuickEditAdvancedState().ui,
      mode: 'advanced' as const,
      modeSelectionPending: false,
      tracks: { ...createQuickEditAdvancedState().ui.tracks, zoom: true },
    },
    zoom: { enabled: true, regions: [initial] },
  };
  const setZoom = vi.fn(
    (update: Parameters<Parameters<typeof useReviewZoomEditor>[0]['setZoom']>[0]) => {
      advanced = {
        ...advanced,
        zoom: typeof update === 'function' ? update(advanced.zoom) : update,
      };
    }
  );
  const snapshot = { document: { edits: [] } };
  const resource = {
    source: data.source,
    telemetry: data.telemetry,
    historyProject: data.project,
    file: new File(['video'], 'desktop.mp4', { type: 'video/mp4' }),
    session: { getSnapshot: () => snapshot },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let clock = 3;
  const playback = options.playback
    ? { video: document.createElement('video'), camera: initial.transform }
    : undefined;
  function Harness() {
    const zoom = useReviewZoomEditor({
      zoom: advanced.zoom,
      setZoom,
      timelineDuration: data.source.duration,
      selection: initial.id,
    });
    return (
      <ReviewSelectedProperties
        {...({
          selection: { kind: 'zoom', id: initial.id },
          advanced,
          zoom,
          resource,
          busy: false,
          editing: { exporter: { phase: 'idle', index: null } },
          markers: [],
          focusTime: clock,
          playback,
          audio: { selected: null },
          toSourceTime: (time: number) => time,
        } as unknown as ComponentProps<typeof ReviewSelectedProperties>)}
      />
    );
  }
  const render = () => act(async () => root.render(<Harness />));
  await render();
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const cursor = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="editor.scene.cameraFollowCursor"]') ??
    [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'editor.scene.cameraFollowCursor'
    )!;
  return {
    ...data,
    host,
    render,
    cursor,
    setZoom,
    tick: (time: number) => {
      clock = time;
    },
    selectRange: (start: number, end: number) => {
      advanced = {
        ...advanced,
        zoom: {
          ...advanced.zoom,
          regions: advanced.zoom.regions.map((r) => ({ ...r, start, end })),
        },
      };
    },
    replaceSource: () => {
      const telemetry = { ...data.telemetry, recordingId: 'other-desktop' };
      const project = createReviewRecordingHistoryProject(telemetry, data.source, 'other.mp4');
      if (!project) throw Error('Missingnewsource');
      resource.telemetry = telemetry;
      resource.historyProject = project;
    },
    unmount: () => {
      cleanup?.();
      cleanup = undefined;
    },
    get advanced() {
      return advanced;
    },
  };
}
it('enables Cursor for a Desktop archive with null cursorTrack and prepares mini facts', async () => {
  const view = await mountDesktop();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(view.cursor().disabled).toBe(false);
  });
  act(() => view.cursor().click());
  await view.render();
  expect(view.advanced.zoom.regions[0]!.followCursor).toBe(true);
  await vi.waitFor(async () => {
    await act(async () => {});
    const props = archive.mini.mock.calls.at(-1)?.[0];
    expect(props?.focus?.regions[0]?.cursorFocus?.path.segments.length).toBeGreaterThan(0);
  });
  const prepared = archive.mini.mock.calls.at(-1)![0];
  const geometry = {
    source: view.source,
    output: view.source,
    background: view.advanced.background,
  };
  const before = evaluateQuickEditCameraAtTime(prepared.focus!.regions, 3, geometry),
    after = evaluateQuickEditCameraAtTime(prepared.focus!.regions, 4.5, geometry);
  expect(
    Math.hypot(before.centerX - after.centerX, before.centerY - after.centerY)
  ).toBeGreaterThan(0.02);
  expect(view.project.cursorTrack?.captureMode).toBe('embedded-fallback');
  expect(view.project.cursorTrack?.skin.hidden).toBe(true);
  expect(view.telemetry.cursorTrack).toBeNull();
  expect(view.project.cursorTrack?.samples).toEqual([]);
  expect(view.project.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
  expect(view.setZoom).toHaveBeenCalledOnce();
});

it('excludes a late selected-interval result and aborts the detached request on unmount', async () => {
  const finishes: ((available: boolean) => void)[] = [];
  archive.override = async () => new Promise<boolean>((resolve) => finishes.push(resolve));
  const view = await mountDesktop();
  expect(archive.calls[0]![1]).toEqual({
    startTime: 2.48433516957656,
    duration: 4.335718703592214,
  });
  expect(view.cursor().disabled).toBe(true);
  view.selectRange(0, 0.5);
  await view.render();
  expect(archive.calls[0]![2]!.aborted).toBe(true);
  expect(archive.calls.at(-1)![1]).toEqual({ startTime: 0, duration: 0.5 });
  await act(async () => finishes[0]!(true));
  expect(view.cursor().disabled).toBe(true);
  await act(async () => finishes[1]!(false));
  expect(view.cursor().disabled).toBe(true);
  view.selectRange(2.5, 6.5);
  await view.render();
  const signal = archive.calls.at(-1)![2]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finishes[2]!(true));
  expect(view.setZoom).not.toHaveBeenCalled();
});
it('keeps authored follow when a retired or different archive source refuses new cursor admission', async () => {
  const view = await mountDesktop();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(view.cursor().disabled).toBe(false);
  });
  act(() => view.cursor().click());
  await view.render();
  expect(view.advanced.zoom.regions[0]!.followCursor).toBe(true);
  await view.store.retire(view.identity);
  view.selectRange(2.6, 6.6);
  await view.render();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(view.cursor().disabled).toBe(true);
  });
  expect(view.advanced.zoom.regions[0]!.followCursor).toBe(true);
  view.replaceSource();
  await view.render();
  expect(view.cursor().disabled).toBe(true);
  expect(view.advanced.zoom.regions[0]!.followCursor).toBe(true);
  expect(view.setZoom).toHaveBeenCalledOnce();
});

it('refuses a missing archived source without changing the stored manual region', async () => {
  const view = await mountDesktop({ retired: true });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(archive.results).toContain(false);
  });
  expect(view.cursor().disabled).toBe(true);
  expect(archive.mini.mock.calls.at(-1)![0].disabled).toBe(false);
  expect(view.advanced.zoom.regions[0]!.followCursor).toBeUndefined();
  expect(view.setZoom).not.toHaveBeenCalled();
});
it('ignores late availability from the source that the inspector replaced', async () => {
  const finishes: ((value: boolean) => void)[] = [];
  archive.override = async () => new Promise<boolean>((resolve) => finishes.push(resolve));
  const view = await mountDesktop();
  const original = archive.calls[0]![0];
  view.replaceSource();
  await view.render();
  expect(archive.calls[0]![2]!.aborted).toBe(true);
  expect(archive.calls.at(-1)![0]).not.toBe(original);
  await act(async () => finishes[0]!(true));
  expect(view.cursor().disabled).toBe(true);
  await act(async () => finishes[1]!(false));
  expect(view.cursor().disabled).toBe(true);
  expect(view.setZoom).not.toHaveBeenCalled();
});

it('retains archive queries and history owners across clock and callback updates', async () => {
  const view = await mountDesktop({ playback: true });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(view.cursor().disabled).toBe(false);
  });
  act(() => view.cursor().click());
  await view.render();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(
      archive.mini.mock.calls.at(-1)?.[0].focus?.regions[0]?.cursorFocus?.path.segments.length
    ).toBeGreaterThan(0);
  });
  const counts = {
    availability: archive.calls.length,
    owners: archive.availabilityOwners,
    historyOwners: archive.historyOwners,
    historyReads: archive.historyReads,
  };
  for (const time of [3.1, 3.2, 3.3, 3.4]) {
    view.tick(time);
    await view.render();
  }
  expect({
    availability: archive.calls.length,
    owners: archive.availabilityOwners,
    historyOwners: archive.historyOwners,
    historyReads: archive.historyReads,
  }).toEqual(counts);
  expect(archive.mini.mock.calls.at(-1)![0].focus!.time).toBe(3.4);
});
