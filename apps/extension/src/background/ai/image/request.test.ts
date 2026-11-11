import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestImage } from './request';
import type { ImageModelConfig } from './model-config';
import type { ImageContext } from '../../../contracts/ai/image';
import { resolveImageModelProfile } from '../../../contracts/ai/image-profile';

vi.mock('../operation-observation', () => ({
  createAIOperationObservation: () => ({
    admit: async () => {},
    fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
    observe: async () => {},
  }),
}));

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZw' +
  'AAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
const profile = resolveImageModelProfile(
  { operation: 'image-editing', modelCode: 'black-forest-labs/flux-3-image-klein' },
  { connectionType: 'openai-compatible', baseUrl: 'https://routerai.ru/api/v1' },
  'image-editing'
);
if (!profile) throw new Error('Expected test profile');
const config: ImageModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://routerai.ru/api/v1',
  apiKey: 'synthetic-test-key',
  modelCode: 'black-forest-labs/flux-3-image-klein',
  profile,
};
const context: ImageContext = {
  version: 1,
  intention: 'layers',
  prompt: 'Make it green',
  images: [{ role: 'source', dataUrl: `data:image/png;base64,${png}`, width: 2, height: 3 }],
  parameters: { ...profile.defaults },
};
const fetchMock = vi.fn<typeof globalThis.fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
const run = (beforeSend = async () => {}) =>
  requestImage({ config, context, signal: new AbortController().signal, beforeSend });

describe('native xAI inline-only image results', () => {
  const runXai = () =>
    requestImage({
      config: {
        ...config,
        connectionType: 'xai',
        baseUrl: 'https://api.x.ai/v1',
        modelCode: 'grok-imagine-image',
        profile: { ...profile, transport: 'sdk-images' },
      },
      context: { ...context, intention: 'new-image', images: [], parameters: { variants: 1 } },
      signal: new AbortController().signal,
      beforeSend: async () => {},
    });
  it.each([1, 3])('rejects %i URL results before any follow-up download', async (count) => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: Array.from({ length: count }, (_, index) => ({
          url: `https://api.x.ai/v1/result/${index}`,
        })),
      })
    );
    await expect(runXai()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
  it('retains native base64 generation with exactly one POST', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ b64_json: png }] }));
    expect(await runXai()).toMatchObject({ image: { width: 2, height: 3 } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/images/generations');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});

describe('image network transport', () => {
  it('generates without source attachments or unsupported optional defaults', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ b64_json: png }] }));
    await requestImage({
      config,
      context: { ...context, intention: 'new-image', images: [], parameters: { variants: 1 } },
      signal: new AbortController().signal,
      beforeSend: async () => {},
    });
    const payload: unknown = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload).toEqual({ model: config.modelCode, prompt: context.prompt, n: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('sends one RouterAI edit with inline references and guarded fetch policy', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: [{ b64_json: png }], usage: { cost: 0.85 } })
    );
    const beforeSend = vi.fn(async () => {});
    expect(await run(beforeSend)).toMatchObject({ image: { width: 2, height: 3 }, costRub: 0.85 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://routerai.ru/api/v1/images');
    expect(init).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: config.modelCode,
      prompt: context.prompt,
      n: 1,
      resolution: '768',
      input_references: [{ type: 'image_url', image_url: { url: context.images[0]?.dataUrl } }],
    });
  });
  it('does not retry HTTP failures and discards provider error bodies', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: 'private-provider-debug' } }, { status: 429 })
    );
    await expect(run()).rejects.toMatchObject({
      message: 'provider-failed',
      reason: 'rate-limited',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends the admitted edit rectangle with the user instruction', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ b64_json: png }] }));
    await requestImage({
      config,
      context: { ...context, editRegion: { left: 1, top: 1, width: 1, height: 2 } },
      signal: new AbortController().signal,
      beforeSend: async () => {},
    });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.prompt).toContain('left=1, top=1, width=1, height=2');
    expect(payload.prompt).toContain(`User instruction:\n${context.prompt}`);
    expect(payload.input_references[0].image_url.url).toBe(context.images[0]?.dataUrl);
  });
  it('rejects remote results, malformed images, multiple results and oversized declared bodies', async () => {
    for (const body of [
      { data: [{ url: 'https://other.test/image' }] },
      { data: [{ b64_json: 'QUJDRA==' }] },
      { data: [{ b64_json: png }, { b64_json: png }] },
    ]) {
      fetchMock.mockResolvedValueOnce(Response.json(body));
      await expect(run()).rejects.toThrow('invalid-response');
    }
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { headers: { 'Content-Length': String(33 * 1024 * 1024) } })
    );
    await expect(run()).rejects.toThrow('too-large');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('does not dispatch after admission fails or the request is cancelled', async () => {
    await expect(
      run(async () => {
        throw new Error('stale');
      })
    ).rejects.toThrow('stale');
    expect(fetchMock).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestImage({ config, context, signal: controller.signal, beforeSend: async () => {} })
    ).rejects.toThrow('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves only the fixed admission code when a caught error contains private details', async () => {
    const original = new Error('stale', { cause: { payload: 'synthetic-private-details' } });
    const failure: unknown = await run(async () => {
      throw original;
    }).catch((error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBe(original);
    expect(failure).toMatchObject({ message: 'stale' });
    expect(failure).not.toHaveProperty('cause');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('normalizes chat message.images without relying on content or fetching remote URLs', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [
          { message: { images: [{ image_url: { url: `data:image/png;base64,${png}` } }] } },
        ],
      })
    );
    expect(
      await requestImage({
        config: { ...config, profile: { ...config.profile, transport: 'chat-images' } },
        context,
        signal: new AbortController().signal,
        beforeSend: async () => {},
      })
    ).toMatchObject({ image: { width: 2, height: 3 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://routerai.ru/api/v1/chat/completions');
  });
  it('uses the native SDK edit endpoint with one request and no implicit gateway', async () => {
    const nativeProfile = resolveImageModelProfile(
      { operation: 'image-editing', modelCode: 'gpt-image-1-mini' },
      { connectionType: 'openai', baseUrl: 'https://api.openai.com/v1' },
      'image-editing'
    );
    if (!nativeProfile) throw new Error('Expected native profile');
    fetchMock.mockResolvedValue(Response.json({ created: 1, data: [{ b64_json: png }] }));
    const nativeConfig = {
      ...config,
      baseUrl: 'https://api.openai.com/v1',
      connectionType: 'openai' as const,
      modelCode: 'gpt-image-1-mini',
      profile: nativeProfile,
    };
    expect(
      await requestImage({
        config: nativeConfig,
        context: { ...context, parameters: nativeProfile.defaults },
        signal: new AbortController().signal,
        beforeSend: async () => {},
      })
    ).toMatchObject({ image: { width: 2, height: 3 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/images/edits');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
  });
});
