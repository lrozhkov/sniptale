// @vitest-environment jsdom
import { Group, util, type FabricObject } from 'fabric';
import { buildScenarioEditorCanvasDocument } from '../../../../../features/scenario/capture-step/editor-canvas-document';
import { normalizeScenarioAnnotationsInCanvasJson } from '../../../../document/scenario-annotation-import';
import { assertValidEditorDrawingCanvasJson } from '../../../../document/import-boundary';
import { CUSTOM_JSON_PROPS } from '../../../../document/model/custom-json-props';
import { expect, it, vi } from 'vitest';

import { createObjectLabel } from '../../../../document/model';
import { parseEditorDrawingMetadata } from '../../../../document/import-boundary';
import { duplicateEditorSelection } from './duplicate';

it('clones the selection, assigns new identity, and selects the clone', async () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  const clone: {
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleDrawingJson?: string;
    sniptaleType: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    sniptaleType: 'shape',
    sniptaleDrawingJson: JSON.stringify({
      version: 1,
      object: {
        bounds: { height: 20, width: 30, x: 10, y: 15 },
        color: '#f00',
        fillColor: null,
        id: 'shape-original',
        kind: 'rectangle',
        width: 4,
      },
    }),
    set: vi.fn(),
  };
  const object = {
    clone: vi.fn(async () => clone),
    sniptaleType: 'shape',
  };
  const canvas = {
    add: vi.fn(),
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const prepareObject = vi.fn();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  await duplicateEditorSelection({
    canvas: canvas as never,
    commitHistory,
    nextLabelIndex: () => 3,
    prepareObject,
    syncRuntimeState,
  });

  expect(clone.set).toHaveBeenCalledWith({ left: 24, top: 24 });
  expect(clone.sniptaleId).toBe('00000000-0000-4000-8000-000000000001');
  expect(clone.sniptaleLabel).toBe(createObjectLabel('shape', 3));
  expect(parseEditorDrawingMetadata(clone.sniptaleDrawingJson)).toMatchObject({
    bounds: { x: 34, y: 39 },
    id: '00000000-0000-4000-8000-000000000001',
  });
  expect(prepareObject).toHaveBeenCalledWith(clone);
  expect(canvas.add).toHaveBeenCalledWith(clone);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(clone);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  randomUUID.mockRestore();
});

it.each([false, true])('roundtrips duplicated scenario blur (grouped: %s)', async (grouped) => {
  const document = buildScenarioEditorCanvasDocument({
    assetDataUrl: 'data:image/png;base64,doc',
    sourceWidth: 320,
    sourceHeight: 180,
    overlays: [
      {
        id: 'blur-original',
        kind: 'blur-rect',
        blurSettings: {
          amount: 9,
          blurType: 'solid',
          radius: 8,
          shadow: 0,
          showBorder: false,
          strokeColor: '#112233',
          strokeStyle: 'solid',
          strokeWidth: 0,
        },
        rect: { x: 12, y: 16, width: 80, height: 40 },
      },
    ],
  });
  const normalized = normalizeScenarioAnnotationsInCanvasJson(JSON.stringify(document));
  const [blur] = await util.enlivenObjects<FabricObject>(JSON.parse(normalized).objects);
  if (!blur) throw new Error('Missing blur fixture');
  const originalMetadata = blur.sniptaleScenarioBlurJson;
  const original = grouped ? new Group([blur]) : blur;
  if (grouped) {
    original.sniptaleId = 'group-original';
    original.sniptaleType = 'group';
  }
  const add = vi.fn();
  await duplicateEditorSelection({
    canvas: {
      getActiveObjects: () => [original],
      add,
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    } as never,
    commitHistory: vi.fn(),
    nextLabelIndex: () => 1,
    prepareObject: vi.fn(),
    syncRuntimeState: vi.fn(),
  });
  const clone = add.mock.calls[0]![0] as FabricObject;
  const saved = JSON.stringify({ objects: [clone.toObject([...CUSTOM_JSON_PROPS])] });
  expect(() => assertValidEditorDrawingCanvasJson(saved)).not.toThrow();
  const [reopened] = await util.enlivenObjects<FabricObject>(JSON.parse(saved).objects);
  const copiedBlur = reopened instanceof Group ? reopened.getObjects()[0]! : reopened!;
  expect(copiedBlur.sniptaleId).not.toBe(blur.sniptaleId);
  expect(JSON.parse(copiedBlur.sniptaleScenarioBlurJson!)).toMatchObject({
    id: copiedBlur.sniptaleId,
  });
  expect(blur.sniptaleScenarioBlurJson).toBe(originalMetadata);
});
