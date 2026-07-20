import { beforeEach, expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

const mocks = vi.hoisted(() => ({
  browserFrameCommands: vi.fn(() => [{ id: 'browser' }]),
  canvasCommands: vi.fn(() => [{ id: 'canvas' }]),
  fileCommands: vi.fn(() => [{ id: 'file' }]),
  frameCommands: vi.fn(() => [{ id: 'frame' }]),
  gridCommands: vi.fn(() => [{ id: 'grid' }]),
  imageCommands: vi.fn(() => [{ id: 'image' }]),
  layerEffectsCommands: vi.fn(() => [{ id: 'layer-effects' }]),
  metaCommands: vi.fn(() => [{ id: 'meta' }]),
  toolCommands: vi.fn(() => [{ id: 'tool' }]),
  workspaceCommands: vi.fn(() => [{ id: 'workspace' }]),
}));

vi.mock('./document-sections', () => ({
  buildCanvasSizeCompactCommands: mocks.canvasCommands,
  buildFileCompactCommands: mocks.fileCommands,
  buildImageSizeCompactCommands: mocks.imageCommands,
}));

vi.mock('./frame-sections', () => ({
  buildBrowserFrameCompactCommands: mocks.browserFrameCommands,
  buildFrameCompactCommands: mocks.frameCommands,
}));

vi.mock('./layer-effects', () => ({
  buildLayerEffectsCompactCommands: mocks.layerEffectsCommands,
}));

vi.mock('./workspace-sections', () => ({
  buildGridCompactCommands: mocks.gridCommands,
  buildMetaCompactCommands: mocks.metaCommands,
  buildSelectionActionCommands: vi.fn(),
  buildWorkspaceCompactCommands: mocks.workspaceCommands,
}));

vi.mock('../tool-commands', () => ({
  buildToolCompactCommands: mocks.toolCommands,
}));

import { buildInspectorCompactCommands } from './';

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes the layer-effects inspector through the dedicated compact command builder', () => {
  const params = createInspectorCommandParams();

  const commands = buildInspectorCompactCommands(
    { ...params, inspector: 'layer-effects' } as never,
    {} as never
  );

  expect(commands).toEqual([{ id: 'layer-effects' }]);
  expect(mocks.layerEffectsCommands).toHaveBeenCalledWith(
    expect.objectContaining({ inspector: 'layer-effects' })
  );
  expect(mocks.toolCommands).not.toHaveBeenCalled();
});

it('falls back to tool commands when no dedicated inspector branch matches', () => {
  const params = createInspectorCommandParams();

  const commands = buildInspectorCompactCommands(
    { ...params, inspector: 'tool' } as never,
    {} as never
  );

  expect(commands).toEqual([{ id: 'tool' }]);
  expect(mocks.toolCommands).toHaveBeenCalledOnce();
});

it('routes remaining inspector modes through their dedicated compact builders', () => {
  const params = createInspectorCommandParams();

  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'file' } as never, {} as never)
  ).toEqual([{ id: 'file' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'image-size' } as never, {} as never)
  ).toEqual([{ id: 'image' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'canvas-size' } as never, {} as never)
  ).toEqual([{ id: 'canvas' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'frame' } as never, {} as never)
  ).toEqual([{ id: 'frame' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'browser-frame' } as never, {} as never)
  ).toEqual([{ id: 'browser' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'workspace' } as never, {} as never)
  ).toEqual([{ id: 'workspace' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'grid' } as never, {} as never)
  ).toEqual([{ id: 'grid' }]);
  expect(
    buildInspectorCompactCommands({ ...params, inspector: 'meta' } as never, {} as never)
  ).toEqual([{ id: 'meta' }]);
});

it('returns no commands when the compact inspector has no image outside tool mode', () => {
  const params = createInspectorCommandParams();

  expect(
    buildInspectorCompactCommands(
      { ...params, hasImage: false, inspector: 'file' } as never,
      {} as never
    )
  ).toEqual([]);
});
