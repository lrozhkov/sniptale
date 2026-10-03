// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { util, Rect, type Canvas, type FabricObject } from 'fabric';
import { buildScenarioEditorCanvasDocument } from '../../features/scenario/capture-step/editor-canvas-document';
import type { ScenarioOverlay } from '../../features/scenario/contracts/types/overlays';
import { normalizeScenarioAnnotationsInCanvasJson } from './scenario-annotation-import';
import { assertValidEditorDrawingCanvasJson } from './import-boundary';
import { assertValidFrameAnnotationsInCanvasJson } from '../frame-annotation/import-boundary';
import { CUSTOM_JSON_PROPS } from './model/custom-json-props';
import { applySelectionToolSettingsToObjects } from '../controller/selection/apply/dispatch';
import { syncSelectionToolSettingsFromObject } from '../controller/selection/sync/dispatch';
import { useEditorStore } from '../state/useEditorStore';
import { getBlurSettings } from '../objects/annotation/blur/object';

function documentFor(overlays: ScenarioOverlay[]) {
  return buildScenarioEditorCanvasDocument({
    assetDataUrl: 'data:image/png;base64,doc',
    sourceWidth: 320,
    sourceHeight: 180,
    overlays,
  });
}
const focus: ScenarioOverlay = {
  id: 'focus',
  kind: 'focus-rect',
  rect: { x: 10, y: 20, width: 120, height: 40 },
};
const ring: ScenarioOverlay = { id: 'ring', kind: 'click-ring', point: { x: 32, y: 48 } };
const cursor: ScenarioOverlay = { id: 'cursor', kind: 'cursor', point: { x: 56, y: 78 } };

it('opens real capture-generated frames and pointer markers with both current validators', async () => {
  const original = JSON.stringify(documentFor([focus, ring, cursor]));
  const normalized = normalizeScenarioAnnotationsInCanvasJson(original);
  expect(() => assertValidEditorDrawingCanvasJson(normalized)).not.toThrow();
  expect(() => assertValidFrameAnnotationsInCanvasJson(normalized)).not.toThrow();
  const objects = await util.enlivenObjects<FabricObject>(JSON.parse(normalized).objects);
  expect(objects).toHaveLength(3);
  const saved = JSON.stringify({
    objects: objects.map((object) => object.toObject([...CUSTOM_JSON_PROPS])),
  });
  expect(normalizeScenarioAnnotationsInCanvasJson(saved)).toBe(saved);
  expect(() => assertValidEditorDrawingCanvasJson(saved)).not.toThrow();
  expect(() => assertValidFrameAnnotationsInCanvasJson(saved)).not.toThrow();
});

it.each(['solid', 'pixelate', 'distortion', 'gaussian'] as const)(
  'preserves %s blur settings across Fabric save/reopen',
  async (blurType) => {
    const blurSettings = {
      amount: 9,
      blurType,
      radius: 8,
      shadow: 20,
      showBorder: true,
      strokeColor: '#112233',
      strokeStyle: 'dashed' as const,
      strokeWidth: 5,
    };
    const original = JSON.stringify(
      documentFor([
        {
          id: 'blur',
          kind: 'blur-rect',
          rect: { x: 12, y: 16, width: 80, height: 40 },
          blurSettings,
        },
      ])
    );
    const normalized = normalizeScenarioAnnotationsInCanvasJson(original);
    expect(() => assertValidEditorDrawingCanvasJson(normalized)).not.toThrow();
    expect(() => assertValidFrameAnnotationsInCanvasJson(normalized)).not.toThrow();
    const objects = await util.enlivenObjects<FabricObject>(JSON.parse(normalized).objects);
    const saved = JSON.stringify({
      objects: objects.map((object) => object.toObject([...CUSTOM_JSON_PROPS])),
    });
    const reopened = await util.enlivenObjects<FabricObject>(JSON.parse(saved).objects);
    expect(reopened[0]!.sniptaleType).toBe('blur');
    expect(getBlurSettings(reopened[0]!)).toMatchObject(blurSettings);
    expect(() => assertValidEditorDrawingCanvasJson(saved)).not.toThrow();
    const reopenedBlur = reopened[0];
    if (!(reopenedBlur instanceof Rect)) throw new Error('Expected retained blur rectangle');
    const syncAmount = vi.spyOn(useEditorStore.getState(), 'updateSelectionDrawingToolSettings');
    syncSelectionToolSettingsFromObject(reopenedBlur, 'blur');
    expect(syncAmount).toHaveBeenCalledWith('blur', { amount: 9 });
    syncAmount.mockRestore();
    applySelectionToolSettingsToObjects(
      { requestRenderAll: vi.fn() } as unknown as Canvas,
      [reopenedBlur],
      'blur',
      { ...useEditorStore.getState().selectionToolSettings, blur: { amount: 17 } }
    );
    const changed = JSON.stringify({ objects: [reopened[0]!.toObject([...CUSTOM_JSON_PROPS])] });
    expect(() => assertValidEditorDrawingCanvasJson(changed)).not.toThrow();
    const changedObjects = await util.enlivenObjects<FabricObject>(JSON.parse(changed).objects);
    expect(getBlurSettings(changedObjects[0]!)).toMatchObject({ ...blurSettings, amount: 17 });
    expect(() => assertValidFrameAnnotationsInCanvasJson(saved)).not.toThrow();
  }
);

it.each([
  { sniptaleType: 'brush' },
  { sniptaleDrawingJson: '{}' },
  { sniptaleBrushWidth: 10 },
  { sniptaleBlurAmount: 9 },
  { left: '10' },
  { width: -1 },
  { scaleX: 2 },
  { objects: [] },
  { clipPath: { type: 'Rect' } },
  { opacity: 0.5 },
  { sniptaleShapeStrokeStyle: 'invalid' },
  { sniptaleId: '' },
])('rejects malformed or mixed scenario annotations: %j', (patch) => {
  const document = documentFor([focus]);
  expect(() =>
    normalizeScenarioAnnotationsInCanvasJson(
      JSON.stringify({ ...document, objects: [{ ...document.objects[0], ...patch }] })
    )
  ).toThrow('Invalid scenario editor annotation');
});

it('keeps unrelated removed drawings rejected, including nested scenario objects', () => {
  for (const object of [
    { sniptaleType: 'rectangle' },
    { type: 'Group', objects: documentFor([focus]).objects },
  ]) {
    const normalized = normalizeScenarioAnnotationsInCanvasJson(
      JSON.stringify({ objects: [object] })
    );
    expect(() => assertValidEditorDrawingCanvasJson(normalized)).toThrow(
      'Removed editor drawing object'
    );
  }
});

it('does not mutate persisted input and retains ids, labels, visibility and locks', async () => {
  const document = documentFor([focus, ring, cursor]);
  document.objects[0] = { ...document.objects[0], visible: false, sniptaleLocked: true };
  const serialized = JSON.stringify(document);
  const normalized = normalizeScenarioAnnotationsInCanvasJson(serialized);
  expect(JSON.stringify(document)).toBe(serialized);
  const objects = await util.enlivenObjects<FabricObject>(JSON.parse(normalized).objects);
  expect(objects[0]).toMatchObject({
    sniptaleId: 'focus',
    sniptaleLabel: 'Scenario frame',
    visible: false,
    sniptaleLocked: true,
  });
  expect(objects[1]).toMatchObject({ sniptaleId: 'ring', left: 32, top: 48 });
  expect(objects[2]).toMatchObject({ sniptaleId: 'cursor', left: 56, top: 78 });
});

it('accepts a scenario session file while preserving original source and retaining URI safety', async () => {
  const { createScenarioCaptureEditorDocument } =
    await import('../../features/scenario/capture-step/editor-document');
  const { parseImportedEditorDocument } = await import('./file-actions/import-session');
  const document = createScenarioCaptureEditorDocument({
    dataUrl: 'data:image/png;base64,doc',
    sourceWidth: 320,
    sourceHeight: 180,
    overlays: [focus, ring],
  });
  expect(parseImportedEditorDocument(JSON.stringify(document))).toEqual(document);
  const canvas = documentFor([focus]);
  canvas.objects.push({ type: 'Image', src: 'https://example.com/private.png' });
  expect(() =>
    parseImportedEditorDocument(JSON.stringify({ ...document, canvasJson: JSON.stringify(canvas) }))
  ).toThrow();
});

it.each([
  '{}',
  'not-json',
  JSON.stringify({ version: 1, id: 'blur', settings: { amount: 1e100, blurType: 'gaussian' } }),
  JSON.stringify({ version: 2, id: 'blur', settings: { amount: 9, blurType: 'solid' } }),
  JSON.stringify({ version: 1, id: 'wrong', settings: { amount: 9, blurType: 'solid' } }),
  JSON.stringify({ version: 1, id: 'blur', settings: { amount: 9, blurType: 'invalid' } }),
])('rejects invalid retained scenario blur metadata %s', (metadata) => {
  expect(() =>
    assertValidEditorDrawingCanvasJson(
      JSON.stringify({
        objects: [
          {
            type: 'Rect',
            sniptaleId: 'blur',
            sniptaleType: 'blur',
            sniptaleRole: 'annotation',
            sniptaleScenarioBlurJson: metadata,
          },
        ],
      })
    )
  ).toThrow('Invalid scenario blur metadata');
});

it.each([
  { sniptaleBlurSourceData: 'https://example.com/private.png' },
  { sniptaleDrawingJson: '{}' },
  { clipPath: { type: 'Rect' } },
  { sniptaleBlurSourceWidth: -1 },
])('rejects unsafe persisted scenario blur source or mixed metadata: %j', (patch) => {
  const legacy = documentFor([
    {
      id: 'blur',
      kind: 'blur-rect',
      rect: { x: 1, y: 2, width: 30, height: 40 },
      blurSettings: { amount: 9, blurType: 'solid' },
    },
  ]);
  const normalized = JSON.parse(normalizeScenarioAnnotationsInCanvasJson(JSON.stringify(legacy)));
  expect(() =>
    assertValidEditorDrawingCanvasJson(
      JSON.stringify({ objects: [{ ...normalized.objects[0], ...patch }] })
    )
  ).toThrow('Invalid scenario blur metadata');
});
