import { describe, expect, it, vi } from 'vitest';
import { VideoBlockKind, VideoOverlayTemplateKind } from '../../../../features/video/project/types';

const mocks = vi.hoisted(() => ({
  addAnnotationOverlayMock: vi.fn(),
  addAssetClipMock: vi.fn(),
  addShapeOverlayMock: vi.fn(),
  addSubtitleOverlayMock: vi.fn(),
  addTextOverlayMock: vi.fn(),
  addVideoBlockMock: vi.fn(),
  applyProjectUpdateMock: vi.fn((state: any, updater: () => unknown) => ({
    ...state,
    project: updater(),
  })),
}));

vi.mock('../asset-actions', () => ({
  addAnnotationOverlayToProject: mocks.addAnnotationOverlayMock,
  addAssetClipToProject: mocks.addAssetClipMock,
  addShapeOverlayToProject: mocks.addShapeOverlayMock,
  addSubtitleOverlayToProject: mocks.addSubtitleOverlayMock,
  addTextOverlayToProject: mocks.addTextOverlayMock,
  addVideoBlockToProject: mocks.addVideoBlockMock,
}));

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  applyProjectUpdate: mocks.applyProjectUpdateMock,
}));

import {
  createAnnotationInsertionAction,
  createAssetInsertionAction,
  createShapeInsertionAction,
  createSubtitleInsertionAction,
  createTextInsertionAction,
  createVideoBlockInsertionAction,
} from './helpers';

function createStoreState(project: unknown = { id: 'project' }) {
  return {
    currentTime: 12,
    project,
    selectedTrackId: 'track-1',
  } as never;
}

function createInsertionResult(selectedClipId: string) {
  return {
    project: { id: 'next-project' },
    selectedClipId,
    selectedTrackId: 'track-2',
  };
}

function prepareInsertionMocks(result: ReturnType<typeof createInsertionResult>): void {
  mocks.addAssetClipMock.mockReturnValue(result);
  mocks.addAnnotationOverlayMock.mockReturnValue(result);
  mocks.addTextOverlayMock.mockReturnValue(result);
  mocks.addSubtitleOverlayMock.mockReturnValue(result);
  mocks.addShapeOverlayMock.mockReturnValue(result);
  mocks.addVideoBlockMock.mockReturnValue(result);
}

function expectDefaultInsertionCalls(): void {
  expect(mocks.addAssetClipMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    { id: 'asset' },
    'track-1',
    12
  );
  expect(mocks.addAnnotationOverlayMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-1',
    12,
    undefined
  );
  expect(mocks.addTextOverlayMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-1',
    12
  );
  expect(mocks.addSubtitleOverlayMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-1',
    12
  );
  expect(mocks.addShapeOverlayMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-1',
    12,
    'rectangle'
  );
  expect(mocks.addVideoBlockMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project' }),
    VideoBlockKind.STEP_EXPLAINER,
    'track-1',
    12
  );
}

describe('project insertion helpers', () => {
  it('returns null when no project is loaded', () => {
    const set = vi.fn();
    const get = vi.fn(() => createStoreState(null));

    expect(createAssetInsertionAction(set, get)({ id: 'asset' } as never)).toBeNull();
    expect(createAnnotationInsertionAction(set, get)()).toBeNull();
    expect(createVideoBlockInsertionAction(set, get)(VideoBlockKind.STEP_EXPLAINER)).toBeNull();
    expect(createTextInsertionAction(set, get)()).toBeNull();
    expect(createSubtitleInsertionAction(set, get)()).toBeNull();
    expect(createShapeInsertionAction(set, get)('rectangle' as never)).toBeNull();
  });

  it(
    'applies insertion results for asset, annotation, text, and shape overlays',
    verifyInsertionResults
  );
  it(
    'prefers explicit track and time arguments over selection defaults',
    verifyExplicitInsertionTargets
  );
  it('threads explicit logical lanes through the asset insertion seam', () => {
    const set = vi.fn();
    const get = vi.fn(() => createStoreState());
    prepareInsertionMocks(createInsertionResult('clip-lane'));

    createAssetInsertionAction(set, get)({ id: 'asset' } as never, 'track-explicit', 6, 'line-2');

    expect(mocks.addAssetClipMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'project' }),
      { id: 'asset' },
      'track-explicit',
      6,
      'line-2'
    );
  });
});

function verifyInsertionResults() {
  const set = vi.fn();
  const get = vi.fn(() => createStoreState());
  prepareInsertionMocks(createInsertionResult('clip-1'));

  const addAssetClip = createAssetInsertionAction(set, get);
  const addAnnotationOverlay = createAnnotationInsertionAction(set, get);
  const addTextOverlay = createTextInsertionAction(set, get);
  const addSubtitleOverlay = createSubtitleInsertionAction(set, get);
  const addVideoBlock = createVideoBlockInsertionAction(set, get);
  const addShapeOverlay = createShapeInsertionAction(set, get);

  expect(addAssetClip({ id: 'asset' } as never, null, undefined)).toBe('clip-1');
  expect(addAnnotationOverlay()).toBe('clip-1');
  expect(addTextOverlay()).toBe('clip-1');
  expect(addSubtitleOverlay()).toBe('clip-1');
  expect(addVideoBlock(VideoBlockKind.STEP_EXPLAINER)).toBe('clip-1');
  expect(addShapeOverlay('rectangle' as never)).toBe('clip-1');
  expectDefaultInsertionCalls();
  expect(set).toHaveBeenCalledTimes(12);
  expect(set).toHaveBeenLastCalledWith({
    selectedClipId: 'clip-1',
    selectedTrackId: 'track-2',
    selection: { kind: 'clip', clipId: 'clip-1' },
  });
}

function verifyExplicitInsertionTargets() {
  const set = vi.fn();
  const get = vi.fn(() => createStoreState());
  prepareInsertionMocks(createInsertionResult('clip-2'));

  createAssetInsertionAction(set, get)({ id: 'asset' } as never, 'track-explicit', 6);
  createAnnotationInsertionAction(set, get)('track-explicit', 6);
  createVideoBlockInsertionAction(set, get)(VideoBlockKind.CTA_WRAP_UP, 'track-explicit', 6);
  createTextInsertionAction(set, get)('track-explicit', 6);
  createSubtitleInsertionAction(set, get)('track-explicit', 6);
  createShapeInsertionAction(set, get)('rectangle' as never, 'track-explicit', 6);

  expect(mocks.addAssetClipMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    { id: 'asset' },
    'track-explicit',
    6
  );
  expect(mocks.addAnnotationOverlayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-explicit',
    6,
    undefined
  );
  expect(mocks.addTextOverlayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-explicit',
    6
  );
  expect(mocks.addVideoBlockMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    VideoBlockKind.CTA_WRAP_UP,
    'track-explicit',
    6
  );
  expect(mocks.addSubtitleOverlayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-explicit',
    6
  );
  expect(mocks.addShapeOverlayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-explicit',
    6,
    'rectangle'
  );
}

it('threads explicit annotation template kinds through the insertion seam', () => {
  const set = vi.fn();
  const get = vi.fn(() => createStoreState());
  prepareInsertionMocks(createInsertionResult('clip-3'));

  createAnnotationInsertionAction(set, get)(null, undefined, VideoOverlayTemplateKind.TITLE_REVEAL);

  expect(mocks.addAnnotationOverlayMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'project' }),
    'track-1',
    12,
    VideoOverlayTemplateKind.TITLE_REVEAL
  );
});
