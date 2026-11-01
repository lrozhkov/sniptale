import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import fixture from '../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import { isExportReadyVideoProject } from '../../features/video/project/validation/root';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/project/action-feedback/validation';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
import { resolveVideoCompositionActions } from '../../features/video/composition/timeline/frame/actions';
import { recordingEventsProjectCoversTime } from '../../features/video/project/recording-events/project-facts';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import { createRecordingEventsRenderer } from '../../workflows/video-review/recording-events';
import type { VideoProject } from '../../features/video/project/types';
import {
  renderProjectCompositionScene,
  type ProjectCompositionSceneInput,
} from './composition-scene';

const owners = vi.hoisted(() => ({ effects: vi.fn(), draw: vi.fn() }));
vi.mock('../../workflows/video-review/project-captions', () => ({
  createVideoProjectCaptionRenderer: () => ({
    prepare: async () => ({ assertExportable() {}, draw() {} }),
  }),
}));
vi.mock('./runtime', () => ({
  getProjectExportSpatialRenderer: vi.fn(),
  getProjectExportWatermarkRenderer: vi.fn(),
}));
vi.mock('./effect-runtime', () => ({ renderOffscreenProjectEffectFrames: owners.effects }));
vi.mock('./renderer', () => ({ drawProjectFrame: owners.draw }));
vi.mock('../../features/video/composition/effect-runtime', () => ({
  disposeEffectRuntimeComposition: vi.fn(),
}));

const databases: { name: string; db: IDBPDatabase }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
});
afterEach(async () => {
  installPersistenceLockManagerForTests(null);
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});

async function archivedInput(retired = false): Promise<ProjectCompositionSceneInput> {
  const name = `export-recording-events-${crypto.randomUUID()}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
  const store = createRecordingEventsStore(dependencies);
  const writer = await store.begin({
    recordingId: fixture.recordingId,
    eventStreamId: fixture.eventStreamId,
  });
  for (const [index, block] of fixture.blocks.entries())
    await store.append(writer, {
      bytes: new TextEncoder().encode(block.utf8),
      entry: fixture.manifest[index]!,
    });
  if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
  const descriptor = fixture.descriptor;
  await store.finalize(writer, descriptor);
  if (retired) await store.retire(writer, writer.writerGeneration);
  const base = createVideoProjectFromRecording({
    recordingId: fixture.recordingId,
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 2,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const saved = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({
      ...group,
      events: descriptor,
      gestureStyles: [{ ...REVIEW_CLICK_DEFAULT, id: 'click-1', effect: 'ripple', after: 1.5 }],
      keyDefaults: { ...REVIEW_KEY_DEFAULT, enabled: true },
    })),
  });
  const reopened: unknown = JSON.parse(JSON.stringify(saved));
  if (!isExportReadyVideoProject(reopened)) throw new Error('Invalid reopened project.');
  return {
    project: reopened,
    settings: {
      format: 'MP4',
      mp4VideoCodec: 'AVC',
      width: 640,
      height: 360,
      fps: 24,
      resolution: 'SOURCE',
      quality: 'MEDIUM',
      downloadAfterExport: false,
      scope: 'selected-range',
      rangeStartSeconds: 1.1,
      rangeEndSeconds: 1.2,
    },
    job: { cancelled: false, recordingEventsRenderer: createRecordingEventsRenderer(dependencies) },
    currentTime: 0.2,
    context: {} as CanvasRenderingContext2D,
    loadedImages: {},
    clipMediaElements: new Map(),
  };
}

it.each([0.2, 0.875, 1])(
  'renders archived click and key visuals after JSON reopen at frame %s, including held transition endpoints',
  async (time) => {
    const args = await archivedInput();
    args.currentTime = time;
    args.captionSampleTime = time;
    const saved = JSON.stringify(args.project);
    expect(args.project.actionEvents).toEqual([]);
    expect(resolveVideoCompositionActions(args.project, time)).toEqual([]);
    await renderProjectCompositionScene(args);
    const rendered: VideoProject = owners.draw.mock.calls[0]![1];
    expect(recordingEventsProjectCoversTime(rendered, time)).toBe(true);
    expect(recordingEventsProjectCoversTime(rendered, time + 0.001)).toBe(false);
    expect(resolveVideoCompositionActions(rendered, time).map((state) => state.event.kind)).toEqual(
      expect.arrayContaining(['CLICK', 'KEY'])
    );
    expect(owners.effects).toHaveBeenCalledWith(expect.objectContaining({ project: rendered }));
    expect(JSON.stringify(rendered)).toBe(saved);
    expect(JSON.stringify(args.project)).toBe(saved);
    args.job.recordingEventsRenderer!.clear();
  }
);

it('refuses an unavailable archived event source before publishing an incomplete frame', async () => {
  const args = await archivedInput(true);
  await expect(renderProjectCompositionScene(args)).rejects.toThrow('source is unavailable');
  expect(owners.effects).not.toHaveBeenCalled();
  expect(owners.draw).not.toHaveBeenCalled();
  args.job.recordingEventsRenderer!.clear();
});
