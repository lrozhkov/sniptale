import { expect, it } from 'vitest';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  EDITOR_RASTER_BINARY_FIELDS,
  hasEditorRasterMetadata,
  inspectEditorRasterCanvas,
  parseEditorRasterMetadata,
} from './raster-state';

const image = 'data:image/png;base64,QUJDRA==';
const resource = (value: unknown, kind: 'image' | 'mask'): value is string =>
  isImageDataUrl(value) && (kind === 'image' || value.startsWith('data:image/png;'));
const metadata = {
  sniptaleRasterState: {
    version: 1,
    width: 12,
    height: 8,
    crop: { x: 2, y: 1, width: 8, height: 6 },
  },
  ...Object.fromEntries(EDITOR_RASTER_BINARY_FIELDS.map((field) => [field, image])),
};

it('accepts all retained resources and copies bounded source pixel crop state', () => {
  expect(parseEditorRasterMetadata(metadata, resource)).toEqual(metadata);
  expect(parseEditorRasterMetadata(metadata, resource)?.sniptaleRasterState).not.toBe(
    metadata.sniptaleRasterState
  );
  expect(inspectEditorRasterCanvas({ objects: [{ objects: [metadata] }] }, resource)).toEqual({
    valid: true,
    hasRaster: true,
  });
  expect(inspectEditorRasterCanvas({}, resource)).toEqual({ valid: true, hasRaster: false });
});

it.each([
  { sniptaleRasterOriginalData: image },
  { sniptaleRasterState: metadata.sniptaleRasterState },
  { ...metadata, sniptaleRasterOriginalData: 'https://example.com/source.png' },
  { ...metadata, sniptaleRasterVisibilityData: 'data:image/jpeg;base64,QUJDRA==' },
  { ...metadata, sniptaleRasterKeyData: null },
  ...[
    { version: 2 },
    { width: 0 },
    { width: 32769 },
    { width: 10001, height: 10000 },
    { width: 1.5 },
    { crop: { x: -1, y: 0, width: 1, height: 1 } },
    { crop: { x: 11, y: 0, width: 2, height: 1 } },
    { crop: { x: 0, y: 0, width: 1, height: 9 } },
  ].map((patch) => ({
    ...metadata,
    sniptaleRasterState: { ...metadata.sniptaleRasterState, ...patch },
  })),
])('rejects partial or malformed metadata %#', (value) => {
  expect(hasEditorRasterMetadata(value)).toBe(true);
  expect(parseEditorRasterMetadata(value, resource)).toBeNull();
  expect(inspectEditorRasterCanvas({ objects: [value] }, resource).valid).toBe(false);
});

it('bounds recursive objects and clip paths at the existing Fabric tree limits', () => {
  let object: unknown = metadata;
  for (let i = 0; i < 40; i++) object = { clipPath: object };
  expect(inspectEditorRasterCanvas({ objects: [object] }, resource).valid).toBe(true);
  expect(inspectEditorRasterCanvas({ objects: [{ clipPath: object }] }, resource).valid).toBe(
    false
  );
  expect(
    inspectEditorRasterCanvas({ objects: Array.from({ length: 20001 }, () => ({})) }, resource)
      .valid
  ).toBe(false);
});
