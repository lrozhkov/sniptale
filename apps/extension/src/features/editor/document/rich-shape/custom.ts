import type {
  EditorBuiltInShapeCapability,
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapeTextFrame,
  EditorBuiltInShapeViewBox,
} from './catalog/types';
import {
  normalizeEditorCustomShapeImportMetadata,
  normalizeEditorCustomShapeRichShapeDefaults,
  type EditorCustomShapeImportMetadata,
  type EditorCustomShapeRichShapeDefaults,
} from './custom-metadata';
import { normalizeSource } from './source';
import type { EditorRichShapeRoughStyle, EditorRichShapeSourceMetadata } from './types';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

export type {
  EditorCustomShapeImportMetadata,
  EditorCustomShapeRichShapeDefaults,
} from './custom-metadata';

export interface EditorCustomShapeDefinition {
  id: string;
  label: string;
  category: string;
  tags: readonly string[];
  geometry: EditorBuiltInShapeGeometryDefinition;
  capabilities: readonly EditorBuiltInShapeCapability[];
  roughDefaults?: Partial<EditorRichShapeRoughStyle>;
  richShapeDefaults?: EditorCustomShapeRichShapeDefaults;
  source?: EditorRichShapeSourceMetadata;
  importMetadata?: EditorCustomShapeImportMetadata;
}

export interface EditorCustomShapeStoredDefinition extends EditorCustomShapeDefinition {
  createdAt: number;
  enabled: boolean;
  sourceFileName: string | null;
  updatedAt: number;
}

const CAPABILITIES = ['text', 'fill', 'line', 'effects', 'connectors'] as const;
const PATH_COMMAND_LENGTHS = { M: 3, L: 3, Q: 5, C: 7, A: 8, Z: 1 } as const;

function parseViewBox(value: unknown): EditorBuiltInShapeViewBox | null {
  if (
    !isRecord(value) ||
    !isNumber(value['minX']) ||
    !isNumber(value['minY']) ||
    !isNumber(value['width']) ||
    !isNumber(value['height']) ||
    value['width'] <= 0 ||
    value['height'] <= 0
  ) {
    return null;
  }

  return {
    minX: value['minX'],
    minY: value['minY'],
    width: value['width'],
    height: value['height'],
  };
}

function parseTextFrame(
  value: unknown,
  viewBox: EditorBuiltInShapeViewBox
): EditorBuiltInShapeTextFrame | null {
  if (
    !isRecord(value) ||
    !isNumber(value['left']) ||
    !isNumber(value['top']) ||
    !isNumber(value['width']) ||
    !isNumber(value['height']) ||
    value['width'] <= 0 ||
    value['height'] <= 0
  ) {
    return null;
  }

  const right = value['left'] + value['width'];
  const bottom = value['top'] + value['height'];
  if (
    value['left'] < viewBox.minX ||
    value['top'] < viewBox.minY ||
    right > viewBox.minX + viewBox.width ||
    bottom > viewBox.minY + viewBox.height
  ) {
    return null;
  }

  return {
    height: value['height'],
    left: value['left'],
    top: value['top'],
    width: value['width'],
  };
}

function isPathCommand(value: unknown): value is EditorBuiltInShapePathCommand {
  if (!Array.isArray(value) || !isString(value[0])) {
    return false;
  }

  const command = value[0] as keyof typeof PATH_COMMAND_LENGTHS;
  const expectedLength = PATH_COMMAND_LENGTHS[command];
  if (!expectedLength || value.length !== expectedLength) {
    return false;
  }

  if (command === 'Z') {
    return true;
  }

  return value.slice(1).every(isNumber);
}

function parsePathPrimitive(value: unknown): EditorBuiltInShapePathPrimitive | null {
  if (!isRecord(value) || !Array.isArray(value['commands'])) {
    return null;
  }

  const commands = value['commands'];
  if (commands.length === 0 || !commands.every(isPathCommand)) {
    return null;
  }

  const fillRule = value['fillRule'];
  return {
    commands,
    ...(fillRule === 'evenodd' || fillRule === 'nonzero' ? { fillRule } : {}),
  };
}

function parseCapabilities(value: unknown): readonly EditorBuiltInShapeCapability[] {
  if (!Array.isArray(value)) {
    return ['fill', 'line', 'effects'];
  }

  const capabilities = value.filter((item): item is EditorBuiltInShapeCapability =>
    CAPABILITIES.some((capability) => capability === item)
  );
  return capabilities.length > 0 ? capabilities : ['fill', 'line', 'effects'];
}

export function parseEditorCustomShapeGeometry(
  value: unknown
): EditorBuiltInShapeGeometryDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const viewBox = parseViewBox(value['viewBox']);
  if (!viewBox) {
    return null;
  }
  const textFrame = parseTextFrame(value['textFrame'], viewBox);

  if (value['type'] === 'polyline' && Array.isArray(value['points'])) {
    const points = value['points'].filter(
      (point): point is readonly [number, number] =>
        Array.isArray(point) && point.length === 2 && isNumber(point[0]) && isNumber(point[1])
    );
    return points.length >= 2
      ? {
          type: 'polyline',
          viewBox,
          points,
          closed: value['closed'] === true,
          ...(textFrame ? { textFrame } : {}),
        }
      : null;
  }

  if (value['type'] !== 'path' || !Array.isArray(value['paths'])) {
    return null;
  }

  const paths = value['paths']
    .map(parsePathPrimitive)
    .filter((path): path is EditorBuiltInShapePathPrimitive => path !== null);
  return paths.length > 0
    ? { type: 'path', viewBox, paths, ...(textFrame ? { textFrame } : {}) }
    : null;
}

export function normalizeEditorCustomShapeDefinition(
  value: unknown
): EditorCustomShapeDefinition | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['label'])) {
    return null;
  }

  const geometry = parseEditorCustomShapeGeometry(value['geometry']);
  if (!geometry) {
    return null;
  }

  const richShapeDefaults = normalizeEditorCustomShapeRichShapeDefaults(value['richShapeDefaults']);
  const source = isRecord(value['source']) ? normalizeSource(value['source']) : undefined;
  const importMetadata = normalizeEditorCustomShapeImportMetadata(value['importMetadata']);
  return {
    id: value['id'],
    label: value['label'],
    category:
      isString(value['category']) && value['category'].trim() ? value['category'] : 'custom',
    tags: Array.isArray(value['tags']) ? value['tags'].filter(isString) : [],
    geometry,
    capabilities: parseCapabilities(value['capabilities']),
    ...(isRecord(value['roughDefaults']) ? { roughDefaults: value['roughDefaults'] } : {}),
    ...(richShapeDefaults ? { richShapeDefaults } : {}),
    ...(source ? { source } : {}),
    ...(importMetadata ? { importMetadata } : {}),
  };
}

export function normalizeEditorCustomShapeStoredDefinition(
  value: unknown
): EditorCustomShapeStoredDefinition | null {
  const definition = normalizeEditorCustomShapeDefinition(value);
  if (!definition || !isRecord(value)) {
    return null;
  }

  return {
    ...definition,
    createdAt: isNumber(value['createdAt']) ? value['createdAt'] : Date.now(),
    enabled: value['enabled'] !== false,
    sourceFileName:
      value['sourceFileName'] === null || isString(value['sourceFileName'])
        ? value['sourceFileName']
        : null,
    updatedAt: isNumber(value['updatedAt']) ? value['updatedAt'] : Date.now(),
  };
}
