import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createAutoProcessingActions } from './timeline-auto-transform';
import type {
  AutoProcessingPreview,
  AutoProcessingRequest,
} from '../../../project/operations/auto-transform';
const { prepare, currentTelemetry } = vi.hoisted(() => ({
  prepare: vi.fn(),
  currentTelemetry: vi.fn(),
}));
vi.mock('../../../project/operations/auto-transform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../project/operations/auto-transform')>()),
  prepareAutoProcessing: prepare,
  isAutoProcessingTelemetryCurrent: currentTelemetry,
}));
const request: AutoProcessingRequest = {
  targets: [],
  camera: false,
  settings: DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
};
function fixture() {
  const project = createEmptyVideoProject('Original');
  project.baseRecordingId = 'implicit-base';
  const authority = { project };
  const store = {
    updateProject: vi.fn((updater: (current: typeof project) => typeof project) => {
      authority.project = updater(authority.project);
    }),
  };
  const preview: AutoProcessingPreview = {
    status: 'ready',
    sourceProject: project,
    project: { ...project, name: 'Processed' },
    request,
    suggestions: [],
    selectedIds: ['change'],
    telemetry: [],
    summary: {
      beforeDuration: 8,
      afterDuration: 6,
      affectedCount: 1,
      shiftedCount: 1,
      removedDuration: 2,
    },
  };
  return {
    authority,
    store,
    preview,
    actions: createAutoProcessingActions(store, () => authority.project),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  currentTelemetry.mockResolvedValue(true);
});
it('forwards empty scope without inferring a recording or applying during preparation', async () => {
  const f = fixture();
  prepare.mockResolvedValue({
    ...f.preview,
    status: 'unchanged',
    selectedIds: [],
    project: f.authority.project,
  });
  await f.actions.prepare(request);
  expect(prepare).toHaveBeenCalledWith(
    f.authority.project,
    request,
    undefined,
    expect.any(Function)
  );
  expect(request.targets).toEqual([]);
  expect(f.store.updateProject).not.toHaveBeenCalled();
});
it('applies the reviewed snapshot once after telemetry admission', async () => {
  const f = fixture();
  expect(await f.actions.apply(f.preview)).toBe('applied');
  expect(f.store.updateProject).toHaveBeenCalledOnce();
  expect(f.authority.project).toBe(f.preview.project);
  expect(await f.actions.apply(f.preview)).toBe('stale');
  expect(f.store.updateProject).toHaveBeenCalledOnce();
});
it('rejects a same-id same-timestamp different project reference after asynchronous preparation', async () => {
  const f = fixture();
  prepare.mockResolvedValue(f.preview);
  const pending = f.actions.prepare(request);
  f.authority.project = { ...f.authority.project };
  expect(await pending).toEqual({ status: 'stale' });
  expect(f.store.updateProject).not.toHaveBeenCalled();
});
it('rejects telemetry changes or project edits during apply admission', async () => {
  const f = fixture();
  currentTelemetry.mockResolvedValueOnce(false);
  expect(await f.actions.apply(f.preview)).toBe('stale');
  currentTelemetry.mockImplementationOnce(async () => {
    f.authority.project = { ...f.authority.project };
    return true;
  });
  expect(await f.actions.apply(f.preview)).toBe('stale');
  expect(f.store.updateProject).not.toHaveBeenCalled();
});
it('rechecks identity inside the commit callback and makes empty candidates no-ops', async () => {
  const f = fixture();
  expect(await f.actions.apply({ ...f.preview, status: 'unchanged', selectedIds: [] })).toBe(
    'unchanged'
  );
  expect(f.store.updateProject).not.toHaveBeenCalled();
  f.store.updateProject.mockImplementation((updater) => {
    f.authority.project = { ...f.authority.project, name: 'Race winner' };
    f.authority.project = updater(f.authority.project);
  });
  expect(await f.actions.apply(f.preview)).toBe('stale');
  expect(f.authority.project.name).toBe('Race winner');
});
