import { afterEach, expect, it, vi } from 'vitest';
import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  SCENARIO_LAYER_CLIPBOARD_MIME,
  SCENARIO_LAYER_CLIPBOARD_LIMITS,
  createScenarioLayerClipboardText,
  insertScenarioLayerClipboardPayload,
  readScenarioLayerClipboardPayloadFromData,
  writeScenarioLayerClipboardTextToData,
} from './layer-clipboard';

afterEach(() => {
  vi.restoreAllMocks();
});

it('serializes selected layers and inserts them into another active slide with fresh ids', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const project = createLayerClipboardProject();
  const text = createScenarioLayerClipboardText({
    selectedElementIds: ['text-1'],
    slide: project.slides[0]!,
  });
  const payload = readScenarioLayerClipboardPayloadFromData(createClipboardData({ plain: text }));

  expect(payload).not.toBeNull();
  const result = payload
    ? insertScenarioLayerClipboardPayload({
        payload,
        project,
        targetSlideId: 'slide-2',
      })
    : null;

  expect(result?.pastedElementIds).toEqual(['element-00000000-0000-4000-8000-000000000001']);
  expect(result?.project.slides[1]?.elements).toEqual([
    expect.objectContaining({
      frame: { height: 80, width: 200, x: 40, y: 60 },
      id: 'element-00000000-0000-4000-8000-000000000001',
      kind: 'text',
      text: 'Title',
    }),
  ]);
  expect(result?.project.slides[0]?.elements[0]?.id).toBe('text-1');
  expect(result?.project.updatedAt).toBe(500);
});

it('accepts every supported scenario layer kind from custom clipboard data', () => {
  const project = createLayerClipboardProject({
    elements: [
      { ...createScenarioArrowElement(), id: 'arrow-1' },
      { ...createScenarioCalloutElement(), id: 'callout-1' },
      { ...createScenarioCodeElement(), id: 'code-1' },
      { ...createScenarioImageElement(), id: 'image-1' },
      { ...createScenarioLineElement(), id: 'line-1' },
      { ...createScenarioShapeElement(), id: 'shape-1' },
      { ...createScenarioTextElement({ text: 'Text' }), id: 'text-1' },
    ],
  });
  const selectedElementIds = project.slides[0]!.elements.map((element) => element.id);
  const text = createScenarioLayerClipboardText({
    selectedElementIds,
    slide: project.slides[0]!,
  });
  const custom = text?.replace('sniptale:scenario-layers:', '') ?? null;

  const payload = readScenarioLayerClipboardPayloadFromData(createClipboardData({ custom }));

  expect(payload).not.toBeNull();
});

it('rejects pasted layers with malformed kind-specific fields', () => {
  const project = createLayerClipboardProject({
    elements: [{ ...createScenarioShapeElement({ shape: 'rect' }), id: 'shape-1' }],
  });
  const text = createScenarioLayerClipboardText({
    selectedElementIds: ['shape-1'],
    slide: project.slides[0]!,
  });
  const custom =
    text
      ?.replace('sniptale:scenario-layers:', '')
      .replace('"shape":"rect"', '"shape":"triangle"') ?? null;

  expect(readScenarioLayerClipboardPayloadFromData(createClipboardData({ custom }))).toBeNull();
});

it('offsets same-slide paste without moving layers beyond the canvas bounds', () => {
  vi.spyOn(Date, 'now').mockReturnValue(600);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002');
  const project = createLayerClipboardProject({
    frame: { height: 80, width: 200, x: 1100, y: 650 },
  });
  const text = createScenarioLayerClipboardText({
    selectedElementIds: ['text-1'],
    slide: project.slides[0]!,
  });
  const payload = readScenarioLayerClipboardPayloadFromData(createClipboardData({ plain: text }));

  const result = payload
    ? insertScenarioLayerClipboardPayload({
        payload,
        project,
        targetSlideId: 'slide-1',
      })
    : null;

  expect(result?.project.slides[0]?.elements.at(-1)).toEqual(
    expect.objectContaining({
      frame: { height: 80, width: 200, x: 1080, y: 640 },
      id: 'element-00000000-0000-4000-8000-000000000002',
    })
  );
});

it('keeps missing selections and invalid clipboard data as no-ops', () => {
  const project = createLayerClipboardProject();

  expect(
    createScenarioLayerClipboardText({
      selectedElementIds: ['missing'],
      slide: project.slides[0]!,
    })
  ).toBeNull();
  expect(
    readScenarioLayerClipboardPayloadFromData(createClipboardData({ plain: 'plain text' }))
  ).toBeNull();
});

it('rejects oversized raw clipboard text before parsing', () => {
  const parse = vi.spyOn(JSON, 'parse');
  const custom = 'x'.repeat(SCENARIO_LAYER_CLIPBOARD_LIMITS.maxRawTextLength + 1);

  expect(readScenarioLayerClipboardPayloadFromData(createClipboardData({ custom }))).toBeNull();
  expect(parse).not.toHaveBeenCalled();
});

it('rejects payloads with too many elements before cloning or inserting', () => {
  const project = createLayerClipboardProject();
  const structuredCloneSpy = vi.spyOn(globalThis, 'structuredClone');
  const element = project.slides[0]!.elements[0]!;
  const elements = Array.from(
    { length: SCENARIO_LAYER_CLIPBOARD_LIMITS.maxElements + 1 },
    (_, index) => ({ ...element, id: `text-${index}` })
  );

  const result = insertScenarioLayerClipboardPayload({
    payload: {
      elements,
      kind: 'sniptale.scenario.layers',
      sourceSlideId: 'slide-1',
      version: 1,
    },
    project,
    targetSlideId: 'slide-2',
  });

  expect(result).toBeNull();
  expect(project.slides[1]?.elements).toEqual([]);
  expect(structuredCloneSpy).not.toHaveBeenCalled();
});

it('rejects payloads with an oversized serialized element before cloning or inserting', () => {
  const project = createLayerClipboardProject();
  const structuredCloneSpy = vi.spyOn(globalThis, 'structuredClone');
  const element = {
    ...project.slides[0]!.elements[0]!,
    extra: 'x'.repeat(SCENARIO_LAYER_CLIPBOARD_LIMITS.maxSerializedElementLength + 1),
  };

  const result = insertScenarioLayerClipboardPayload({
    payload: {
      elements: [element],
      kind: 'sniptale.scenario.layers',
      sourceSlideId: 'slide-1',
      version: 1,
    },
    project,
    targetSlideId: 'slide-2',
  });

  expect(result).toBeNull();
  expect(project.slides[1]?.elements).toEqual([]);
  expect(structuredCloneSpy).not.toHaveBeenCalled();
});

it('writes custom and plain clipboard data for browser paste compatibility', () => {
  const writes = new Map<string, string>();
  const written = writeScenarioLayerClipboardTextToData(
    {
      setData: (type, value) => writes.set(type, value),
    },
    'sniptale:scenario-layers:{"kind":"sniptale.scenario.layers"}'
  );

  expect(written).toBe(true);
  expect(writes.get(SCENARIO_LAYER_CLIPBOARD_MIME)).toBe('{"kind":"sniptale.scenario.layers"}');
  expect(writes.get('text/plain')).toBe(
    'sniptale:scenario-layers:{"kind":"sniptale.scenario.layers"}'
  );
});

function createLayerClipboardProject(
  options: {
    elements?: NonNullable<ScenarioProjectV3['slides'][number]>['elements'];
    frame?: { height: number; width: number; x: number; y: number };
  } = {}
): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Clipboard');
  const element = {
    ...createScenarioTextElement({
      frame: options.frame ?? { height: 80, width: 200, x: 40, y: 60 },
      text: 'Title',
    }),
    id: 'text-1',
  };
  return {
    ...project,
    slides: [
      { ...project.slides[0]!, elements: options.elements ?? [element], id: 'slide-1' },
      { ...createScenarioSlide({ title: 'Second' }), elements: [], id: 'slide-2' },
    ],
  };
}

function createClipboardData(options: {
  custom?: string | null;
  plain?: string | null;
}): Pick<DataTransfer, 'getData'> {
  return {
    getData: (type) =>
      type === SCENARIO_LAYER_CLIPBOARD_MIME ? (options.custom ?? '') : (options.plain ?? ''),
  };
}
