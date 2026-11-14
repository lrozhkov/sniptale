import { describe, expect, it } from 'vitest';
import {
  getImageContextOperation,
  formatImageProviderPrompt,
  imageContextSchema,
  imageRasterSchema,
  parseImageJobClientMessage,
  parseImageJobServerMessage,
} from './image';

const raster = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  width: 2,
  height: 3,
};
const uuid = 'fdd43bfc-2c5b-416e-91b2-d2c2cc820ac7';

it('admits only fixed provider failure reasons', () => {
  const failure = { type: 'failure', requestId: uuid, code: 'provider-failed' };
  expect(parseImageJobServerMessage({ ...failure, failureReason: 'quota-exceeded' })).toEqual({
    ...failure,
    failureReason: 'quota-exceeded',
  });
  for (const failureReason of ['PRIVATE BODY', { status: 402 }, 402])
    expect(parseImageJobServerMessage({ ...failure, failureReason })).toBeNull();
});
const context = {
  version: 1,
  intention: 'new-image',
  prompt: 'Draw a square',
  images: [],
  parameters: { variants: 1 },
};
const start = {
  type: 'start',
  requestId: uuid,
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedModelCode: 'code',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  llmSessionToken: 'token',
  scope: { documentId: 'document', sessionId: uuid, snapshotId: uuid },
  context,
};

describe('image job admission', () => {
  it('admits generation and raster editing with declared dimensions', () => {
    expect(parseImageJobClientMessage(start)).not.toBeNull();
    for (const intention of ['region', 'source', 'layers'])
      expect(
        parseImageJobClientMessage({
          ...start,
          context: {
            ...context,
            intention,
            images: [{ ...raster, role: 'source' }],
            editRegion: { left: 0, top: 1, width: 2, height: 2 },
          },
        })
      ).not.toBeNull();
  });
  it('binds the edit rectangle to the first source image and rejects invalid coordinates', () => {
    const source = { ...raster, role: 'source' };
    const editing = { ...context, intention: 'region', images: [source] };
    for (const editRegion of [
      undefined,
      { left: -1, top: 0, width: 1, height: 1 },
      { left: 0.5, top: 0, width: 1, height: 1 },
      { left: 1, top: 0, width: 2, height: 1 },
      { left: 0, top: 2, width: 1, height: 2 },
    ])
      expect(imageContextSchema.safeParse({ ...editing, editRegion }).success).toBe(false);
    expect(
      imageContextSchema.safeParse({
        ...editing,
        editRegion: { left: 0, top: 0, width: 1, height: 1 },
        images: [{ ...raster, role: 'reference' }, source],
      }).success
    ).toBe(false);
    expect(
      imageContextSchema.safeParse({
        ...context,
        editRegion: { left: 0, top: 0, width: 1, height: 1 },
      }).success
    ).toBe(false);
    const admitted = imageContextSchema.parse({
      ...editing,
      editRegion: { left: 0, top: 1, width: 2, height: 2 },
    });
    expect(formatImageProviderPrompt(admitted)).toContain('left=0, top=1, width=2, height=2');
    expect(formatImageProviderPrompt(admitted)).toContain(`User instruction:\n${context.prompt}`);
    expect(formatImageProviderPrompt(imageContextSchema.parse(context))).toBe(context.prompt);
  });
  it('rejects missing, duplicate and non-raster source attachments', () => {
    expect(imageContextSchema.safeParse({ ...context, intention: 'layers' }).success).toBe(false);
    expect(
      imageContextSchema.safeParse({
        ...context,
        images: [
          { ...raster, role: 'source' },
          { ...raster, role: 'source' },
        ],
      }).success
    ).toBe(false);
    for (const dataUrl of [
      'https://example.com/p.png',
      'data:image/svg+xml;base64,PHN2Zy8+',
      'data:image/png;base64,QUJDRA==',
    ])
      expect(imageRasterSchema.safeParse({ ...raster, dataUrl }).success).toBe(false);
  });
  it('rejects forged raster geometry and pixel bombs before bitmap allocation', () => {
    expect(imageRasterSchema.safeParse({ ...raster, width: 3 }).success).toBe(false);
    const bytes = Buffer.from(raster.dataUrl.split(',')[1]!, 'base64');
    bytes.writeUInt32BE(8192, 16);
    bytes.writeUInt32BE(8192, 20);
    expect(
      imageRasterSchema.safeParse({
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        width: 8192,
        height: 8192,
      }).success
    ).toBe(false);
  });
  it('rejects extra command fields, unapproved destinations and unsupported parameter values', () => {
    expect(parseImageJobClientMessage({ ...start, apiKey: 'forbidden' })).toBeNull();
    expect(
      parseImageJobClientMessage({ ...start, approvedDestination: 'https://other.test' })
    ).toBeNull();
    expect(
      parseImageJobClientMessage({ ...start, context: { ...context, parameters: { variants: 4 } } })
    ).toBeNull();
    expect(
      parseImageJobClientMessage({
        ...start,
        context: { ...context, parameters: { variants: 1, arbitrary: true } },
      })
    ).toBeNull();
  });
  it('requires editing capability for references during new-image generation', () => {
    const generation = imageContextSchema.parse(context);
    expect(getImageContextOperation(generation)).toBe('image-generation');
    expect(
      getImageContextOperation({ ...generation, images: [{ ...raster, role: 'reference' }] })
    ).toBe('image-editing');
  });
  it('validates incremental previews, fixed failures and request-bound controls', () => {
    expect(
      parseImageJobServerMessage({
        type: 'image',
        requestId: uuid,
        variant: 0,
        image: raster,
        costRub: 0.85,
      })
    ).not.toBeNull();
    expect(
      parseImageJobServerMessage({
        type: 'image',
        requestId: uuid,
        variant: 0,
        image: { ...raster, width: 999 },
      })
    ).toBeNull();
    expect(
      parseImageJobServerMessage({ type: 'failure', requestId: uuid, code: 'raw-provider-secret' })
    ).toBeNull();
    expect(
      parseImageJobServerMessage({ type: 'complete', requestId: uuid, received: 0 })
    ).toBeNull();
    expect(parseImageJobClientMessage({ type: 'cancel', requestId: uuid })).not.toBeNull();
    expect(parseImageJobClientMessage({ type: 'keepalive', requestId: 'foreign' })).toBeNull();
  });
});

it('admits only masks on the disclosed source grid and includes them in provider input ordering', async () => {
  const { getImageProviderInputs } = await import('./image');
  const image = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
    width: 2,
    height: 3,
  };
  const context = {
    version: 1,
    intention: 'region',
    prompt: 'Change selected pixels',
    images: [{ ...image, role: 'source' }],
    parameters: { variants: 1 },
    editRegion: { left: 0, top: 0, width: 1, height: 2 },
    editMask: { mode: 'reference', image },
  };
  const parsed = imageContextSchema.parse(context);
  expect(getImageProviderInputs(parsed)).toEqual([parsed.images[0], parsed.editMask?.image]);
  expect(formatImageProviderPrompt(parsed)).toContain('second input image is an edit mask');
  expect(
    imageContextSchema.safeParse({
      ...context,
      editMask: { mode: 'reference', image: { ...image, width: 3 } },
    }).success
  ).toBe(false);
  expect(
    imageContextSchema.safeParse({ ...context, images: [], editRegion: undefined }).success
  ).toBe(false);
});

it('preserves exact approval limits and strict request-bound controls', () => {
  for (const key of ['modelId', 'approvedProviderId', 'approvedModelCode']) {
    for (const value of ['', ' ', ' leading', 'trailing ', 'x'.repeat(257), undefined])
      expect(parseImageJobClientMessage({ ...start, [key]: value })).toBeNull();
    expect(parseImageJobClientMessage({ ...start, [key]: 'x'.repeat(256) })).not.toBeNull();
  }
  for (const patch of [
    { requestId: 'invalid' },
    { approvedDestination: `sha256:${'a'.repeat(63)}` },
    { approvedDestination: undefined },
    { llmSessionToken: '' },
    { llmSessionToken: 'x'.repeat(513) },
    { llmSessionToken: undefined },
    { unknown: true },
  ])
    expect(parseImageJobClientMessage({ ...start, ...patch })).toBeNull();
  for (const llmSessionToken of ['x'.repeat(512), ' ']) {
    const boundaryRequest = { ...start, llmSessionToken };
    expect(parseImageJobClientMessage(boundaryRequest)).toEqual(boundaryRequest);
  }
  for (const type of ['cancel', 'keepalive']) {
    const command = { type, requestId: uuid };
    expect(parseImageJobClientMessage(command)).toEqual(command);
    expect(parseImageJobClientMessage({ ...command, requestId: 'invalid' })).toBeNull();
    expect(parseImageJobClientMessage({ ...command, unknown: true })).toBeNull();
  }
});
