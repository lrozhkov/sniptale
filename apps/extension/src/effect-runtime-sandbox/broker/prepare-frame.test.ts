import { expect, it } from 'vitest';
import { parseEffectRuntimeRenderRequest } from './request-boundary';
import { prepareEffectRuntimeWorkerRequest } from './prepare-frame';
import { createEffectRuntimeRenderMessage, FakeImageBitmap } from './request-boundary.test-support';
import { EFFECT_RUNTIME_WORKER_REQUEST } from '../../contracts/effect-runtime/types';

async function request() {
  const parsed = await parseEffectRuntimeRenderRequest(await createEffectRuntimeRenderMessage());
  if (!parsed.ok) throw new Error('Invalid animation request fixture.');
  return parsed.request;
}

it('forwards the verified self-contained animation without decoding or modifying package bytes', async () => {
  const input = await request(),
    before = structuredClone(input);
  const result = await prepareEffectRuntimeWorkerRequest(input);
  expect(result).toMatchObject({
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    documentRef: { id: input.documentId, document: input.document },
    assetSelectionRef: { id: input.assetSelectionId, assets: {} },
    inputFrames: {},
    width: 1280,
    height: 720,
    renderWidth: 1280,
    renderHeight: 720,
    time: 0.5,
    progress: 0.25,
    duration: 2,
  });
  expect(input).toEqual(before);
});

it('omits already acknowledged payloads while preserving their immutable identities', async () => {
  const input = await request();
  const result = await prepareEffectRuntimeWorkerRequest({
    ...input,
    documentPayloadIncluded: false,
    assetSelectionPayloadIncluded: false,
  });
  expect(result.documentRef).toEqual({ id: input.documentId });
  expect(result.assetSelectionRef).toEqual({ id: input.assetSelectionId });
});

it.each(['image', 'svg'] as const)(
  'refuses detached %s assets before any decoder can allocate resources',
  async (kind) => {
    const input = await request();
    await expect(
      prepareEffectRuntimeWorkerRequest({
        ...input,
        assets: [
          {
            id: 'foreign',
            kind,
            byteLength: 1,
            bytes: Uint8Array.of(1).buffer,
            mimeType: kind === 'image' ? 'image/png' : 'image/svg+xml',
            sha256: 'a'.repeat(64),
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'inputRejected' });
  }
);

it('refuses a borrowed source frame without taking ownership from its caller', async () => {
  const input = await request(),
    bitmap = new FakeImageBitmap(1280, 720);
  await expect(
    prepareEffectRuntimeWorkerRequest({
      ...input,
      inputFrames: { source: { bitmap, width: 1280, height: 720 } },
    })
  ).rejects.toMatchObject({ code: 'inputRejected' });
  expect(bitmap.close).not.toHaveBeenCalled();
});
