import { createScenarioV3Id, isScenarioElementV3 } from '../../features/scenario/project/v3';
import { SCENARIO_V3_LIMITS } from '../../features/scenario/project/v3/limits';
import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { MAX_CLIPBOARD_TEXT_LENGTH } from '@sniptale/runtime-contracts/validation/text';

export const SCENARIO_LAYER_CLIPBOARD_MIME = 'application/x-sniptale-scenario-layers+json';
export const SCENARIO_LAYER_CLIPBOARD_LIMITS = {
  maxElements: SCENARIO_V3_LIMITS.maxElementsPerSlide,
  maxRawTextLength: MAX_CLIPBOARD_TEXT_LENGTH,
  maxSerializedElementLength: MAX_CLIPBOARD_TEXT_LENGTH,
} as const;

const CLIPBOARD_TEXT_PREFIX = 'sniptale:scenario-layers:';
const CLIPBOARD_PAYLOAD_KIND = 'sniptale.scenario.layers';
const CLIPBOARD_PAYLOAD_VERSION = 1;
const SAME_SLIDE_PASTE_OFFSET = 24;

interface ScenarioLayerClipboardPayload {
  elements: ScenarioElement[];
  kind: typeof CLIPBOARD_PAYLOAD_KIND;
  sourceSlideId: string;
  version: typeof CLIPBOARD_PAYLOAD_VERSION;
}

interface ScenarioLayerClipboardInsertResult {
  pastedElementIds: string[];
  project: ScenarioProjectV3;
}

type UnknownRecord = Record<string, unknown>;

export function createScenarioLayerClipboardText(args: {
  selectedElementIds: readonly string[];
  slide: ScenarioSlide;
}): string | null {
  const selectedIds = new Set(args.selectedElementIds);
  const elements = args.slide.elements.filter((element) => selectedIds.has(element.id));
  if (elements.length === 0) {
    return null;
  }

  return `${CLIPBOARD_TEXT_PREFIX}${JSON.stringify({
    elements,
    kind: CLIPBOARD_PAYLOAD_KIND,
    sourceSlideId: args.slide.id,
    version: CLIPBOARD_PAYLOAD_VERSION,
  })}`;
}

export function readScenarioLayerClipboardPayloadFromData(
  clipboardData: Pick<DataTransfer, 'getData'> | null
): ScenarioLayerClipboardPayload | null {
  if (!clipboardData) {
    return null;
  }

  return (
    parseScenarioLayerClipboardText(clipboardData.getData(SCENARIO_LAYER_CLIPBOARD_MIME)) ??
    parseScenarioLayerClipboardText(clipboardData.getData('text/plain'))
  );
}

export function writeScenarioLayerClipboardTextToData(
  clipboardData: Pick<DataTransfer, 'setData'> | null,
  text: string
): boolean {
  if (!clipboardData) {
    return false;
  }

  const json = text.startsWith(CLIPBOARD_TEXT_PREFIX)
    ? text.slice(CLIPBOARD_TEXT_PREFIX.length)
    : text;
  clipboardData.setData(SCENARIO_LAYER_CLIPBOARD_MIME, json);
  clipboardData.setData('text/plain', text);
  return true;
}

export function insertScenarioLayerClipboardPayload(args: {
  payload: ScenarioLayerClipboardPayload;
  project: ScenarioProjectV3;
  targetSlideId: string;
}): ScenarioLayerClipboardInsertResult | null {
  const targetSlide = args.project.slides.find((slide) => slide.id === args.targetSlideId);
  if (!targetSlide || !isScenarioLayerClipboardPayload(args.payload)) {
    return null;
  }

  const offset = args.payload.sourceSlideId === args.targetSlideId ? SAME_SLIDE_PASTE_OFFSET : 0;
  const elements = args.payload.elements.map((element) =>
    cloneClipboardElement(element, targetSlide.canvas, offset)
  );
  return {
    pastedElementIds: elements.map((element) => element.id),
    project: {
      ...args.project,
      slides: args.project.slides.map((slide) =>
        slide.id === args.targetSlideId
          ? {
              ...slide,
              elements: [...slide.elements, ...elements],
              updatedAt: Date.now(),
            }
          : slide
      ),
      updatedAt: Date.now(),
    },
  };
}

function parseScenarioLayerClipboardText(text: string): ScenarioLayerClipboardPayload | null {
  if (!text || text.length > SCENARIO_LAYER_CLIPBOARD_LIMITS.maxRawTextLength) {
    return null;
  }

  const json = text.startsWith(CLIPBOARD_TEXT_PREFIX)
    ? text.slice(CLIPBOARD_TEXT_PREFIX.length)
    : text;
  try {
    const parsed: unknown = JSON.parse(json);
    return isScenarioLayerClipboardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cloneClipboardElement(
  element: ScenarioElement,
  slideCanvas: ScenarioSlide['canvas'],
  offset: number
): ScenarioElement {
  const now = Date.now();
  const clone = structuredClone(element);
  clone.createdAt = now;
  clone.frame = offsetElementFrame(element.frame, slideCanvas, offset);
  clone.id = createScenarioV3Id('element');
  clone.updatedAt = now;
  return clone;
}

function offsetElementFrame(
  frame: ScenarioElementFrame,
  slideCanvas: ScenarioSlide['canvas'],
  offset: number
): ScenarioElementFrame {
  if (offset === 0) {
    return frame;
  }

  return {
    ...frame,
    x: Math.min(Math.max(0, frame.x + offset), Math.max(0, slideCanvas.width - frame.width)),
    y: Math.min(Math.max(0, frame.y + offset), Math.max(0, slideCanvas.height - frame.height)),
  };
}

function isScenarioLayerClipboardPayload(value: unknown): value is ScenarioLayerClipboardPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value['kind'] === CLIPBOARD_PAYLOAD_KIND &&
    value['version'] === CLIPBOARD_PAYLOAD_VERSION &&
    typeof value['sourceSlideId'] === 'string' &&
    Array.isArray(value['elements']) &&
    areClipboardElementsWithinLimits(value['elements']) &&
    value['elements'].every(isScenarioElementV3)
  );
}

function areClipboardElementsWithinLimits(elements: readonly unknown[]): boolean {
  return (
    elements.length > 0 &&
    elements.length <= SCENARIO_LAYER_CLIPBOARD_LIMITS.maxElements &&
    elements.every(isSerializedElementWithinLimit)
  );
}

function isSerializedElementWithinLimit(element: unknown): boolean {
  try {
    return (
      JSON.stringify(element).length <= SCENARIO_LAYER_CLIPBOARD_LIMITS.maxSerializedElementLength
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
