import { EDITOR_RASTER_BINARY_FIELDS, type EditorDocument } from '../editor/document/public';

/** Immutable pooled values are owned by the runtime or persistence adapter, never by the codec. */
export type EditorImageHistoryValueKind = 'image' | 'json';
interface EditorImageHistoryValuePool {
  intern(value: string, kind: EditorImageHistoryValueKind): string;
}
type EditorImageHistoryValueReader = (
  token: string,
  kind: EditorImageHistoryValueKind
) => string | undefined;
type EditorImageHistoryObjectVisitor = (token: string, object: Record<string, unknown>) => void;
export const IMAGE_HISTORY_VALUE_INLINE_LIMIT = 4_096;
export const IMAGE_HISTORY_VALUE_TOKEN_PREFIX = 'sniptale-history-asset:';
const CANVAS_POOLED_FIELDS = new Set([
  ...EDITOR_RASTER_BINARY_FIELDS,
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleSimplifySourceData',
  'sniptaleBlurSourceData',
  'sniptaleDrawingJson',
]);
const DOCUMENT_POOLED_FIELDS = new Set([
  'sourceImageData',
  'backgroundImageData',
  'faviconDataUrl',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeSharedValue(
  value: unknown,
  key: string,
  encoding: EditorImageHistoryValuePool
): unknown {
  if (
    typeof value !== 'string' ||
    value.length < IMAGE_HISTORY_VALUE_INLINE_LIMIT ||
    (key !== 'sniptaleDrawingJson' && !value.startsWith('data:')) ||
    !(DOCUMENT_POOLED_FIELDS.has(key) || CANVAS_POOLED_FIELDS.has(key))
  )
    return value;
  return encoding.intern(value, value.startsWith('data:') ? 'image' : 'json');
}

function encodeCanvasHistoryValue(
  value: unknown,
  encoding: EditorImageHistoryValuePool,
  visit?: EditorImageHistoryObjectVisitor
): string {
  return JSON.stringify(value, (key, child: unknown) => {
    if (key === 'objects' && Array.isArray(child))
      return poolObjectVersions(child, encoding, visit);
    return encodeSharedValue(child, key, encoding);
  });
}

function poolObjectVersions(
  objects: unknown[],
  encoding: EditorImageHistoryValuePool,
  visit?: EditorImageHistoryObjectVisitor
): unknown[] {
  return objects.map((object: unknown) => {
    if (!isRecord(object)) return object;
    const token = encoding.intern(encodeCanvasHistoryValue(object, encoding), 'json');
    visit?.(token, object);
    return token;
  });
}

/** Encodes only the captured document; unchanged resources retain their owner-issued tokens. */
export function encodeEditorImageHistorySnapshot(
  document: EditorDocument,
  pool: EditorImageHistoryValuePool,
  tokens: Set<string>,
  visit?: EditorImageHistoryObjectVisitor
): string {
  const encoding: EditorImageHistoryValuePool = {
    intern(value, kind) {
      const token = pool.intern(value, kind);
      tokens.add(token);
      return token;
    },
  };
  return JSON.stringify(document, (key, value: unknown) => {
    if (key === 'canvasJson' && typeof value === 'string')
      return encodeCanvasHistoryValue(JSON.parse(value) as unknown, encoding, visit);
    if (key === 'vectorDefinitions' && isRecord(value))
      return Object.fromEntries(
        Object.entries(value).map(([id, definition]) => [
          id,
          encoding.intern(JSON.stringify(definition), 'json'),
        ])
      );
    if (key === 'richShapes' && Array.isArray(value))
      return poolObjectVersions(value, encoding, visit);
    return encodeSharedValue(value, key, encoding);
  });
}

interface EditorImageHistoryDecodeBounds {
  maxDepth: number;
  maxNodes: number;
  maxObjectCharacters?: number;
}

interface EditorImageHistoryDecodeOptions {
  bounds?: EditorImageHistoryDecodeBounds;
  /** Checkpoints use canonical object-version references; legacy in-memory snapshots may be inline. */
  requirePooledObjects?: boolean;
}
interface Decoding extends EditorImageHistoryDecodeOptions {
  read: EditorImageHistoryValueReader;
  objectCharacters: number;
  definitionTokens: Set<string>;
}

function readObjectMetadata(token: string, decoding: Decoding): string | undefined {
  const value = decoding.read(token, 'json');
  if (value !== undefined && decoding.bounds?.maxObjectCharacters !== undefined) {
    decoding.objectCharacters += value.length;
    if (decoding.objectCharacters > decoding.bounds.maxObjectCharacters)
      throw new Error('Image history expanded metadata exceeds its bound.');
  }
  return value;
}

function restoreObjectVersions(objects: unknown[], decoding: Decoding): unknown[] {
  if (decoding.bounds && objects.length > decoding.bounds.maxNodes)
    throw new Error('Image history object list exceeds its traversal bound.');
  return objects.map((object: unknown) => {
    if (typeof object !== 'string') {
      if (decoding.requirePooledObjects)
        throw new Error('Image history object version must be pooled.');
      return object;
    }
    const pooled = readObjectMetadata(object, decoding);
    if (pooled === undefined) {
      if (decoding.requirePooledObjects)
        throw new Error('Image history object version is missing.');
      return object;
    }
    const decoded: unknown = JSON.parse(pooled);
    return decoded;
  });
}

function restoreSharedFields(
  root: unknown,
  fieldNames: ReadonlySet<string>,
  decoding: Decoding,
  restoreObjects: boolean
): void {
  const pending = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value: current, depth } = pending.pop()!;
    if (decoding.bounds && (++nodes > decoding.bounds.maxNodes || depth > decoding.bounds.maxDepth))
      throw new Error('Image history graph exceeds its traversal bound.');
    if (Array.isArray(current)) {
      for (const child of current)
        if (typeof child === 'object' && child !== null)
          pending.push({ value: child, depth: depth + 1 });
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      if (restoreObjects && key === 'objects' && Array.isArray(child)) {
        const objects = restoreObjectVersions(child, decoding);
        current[key] = objects;
        pending.push({ value: objects, depth: depth + 1 });
      } else if (typeof child === 'string' && fieldNames.has(key))
        current[key] =
          (key === 'sniptaleDrawingJson'
            ? readObjectMetadata(child, decoding)
            : decoding.read(child, 'image')) ?? child;
      else if (typeof child === 'object' && child !== null)
        pending.push({ value: child, depth: depth + 1 });
    }
  }
}

/** Decodes one retained state. Optional strictness admits checkpoints from a restart boundary. */
export function decodeEditorImageHistorySnapshot(
  value: string,
  read?: EditorImageHistoryValueReader,
  options: EditorImageHistoryDecodeOptions = {}
): unknown {
  const document: unknown = JSON.parse(value);
  if (!read || !isRecord(document)) return document;
  const decoding: Decoding = { read, ...options, objectCharacters: 0, definitionTokens: new Set() };
  restoreSharedFields(document, DOCUMENT_POOLED_FIELDS, decoding, false);
  const definitions = document['vectorDefinitions'];
  if (isRecord(definitions))
    for (const [id, token] of Object.entries(definitions)) {
      if (typeof token !== 'string') {
        if (options.requirePooledObjects)
          throw new Error('Image history vector definition must be pooled.');
        continue;
      }
      if (options.requirePooledObjects && decoding.definitionTokens.has(token))
        throw new Error('Image history vector definition reference is repeated.');
      decoding.definitionTokens.add(token);
      const pooled = read(token, 'json');
      if (pooled !== undefined) definitions[id] = JSON.parse(pooled) as unknown;
    }
  if (Array.isArray(document['richShapes'])) {
    const shapes = restoreObjectVersions(document['richShapes'], decoding);
    restoreSharedFields(shapes, CANVAS_POOLED_FIELDS, decoding, true);
    document['richShapes'] = shapes;
  }
  const canvasJson = document['canvasJson'];
  if (
    typeof canvasJson === 'string' &&
    (options.requirePooledObjects || canvasJson.includes(IMAGE_HISTORY_VALUE_TOKEN_PREFIX))
  ) {
    const canvas: unknown = JSON.parse(canvasJson);
    restoreSharedFields(canvas, CANVAS_POOLED_FIELDS, decoding, true);
    document['canvasJson'] = JSON.stringify(canvas);
  }
  return document;
}
