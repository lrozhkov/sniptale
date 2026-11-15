import { describe, expect, it } from 'vitest';
import {
  acceptsImageContext,
  resolveImageModelProfile,
  getProviderImageApi,
  getImageModelOutputSize,
  getImageEditFrameSize,
  getImageEditParameters,
} from './image-profile';
import type { ImageContext } from './image';

const provider = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://routerai.ru/api/v1',
  management: 'manual',
} as const;
const model = {
  modelCode: 'black-forest-labs/flux-3-image-klein',
  operation: 'image-editing',
} as const;

describe('image protocol profiles', () => {
  it('routes catalog-declared dialog image output without model-name inference', () => {
    const profile = resolveImageModelProfile(
      {
        ...model,
        modelCode: 'arbitrary-dialog',
        capabilities: {
          operations: { 'image-editing': 'supported' },
          input: { text: 'supported', image: 'supported' },
          output: { text: 'supported', image: 'supported' },
          features: {},
        },
      },
      provider,
      'image-editing'
    );
    expect(profile).toMatchObject({
      transport: 'chat-images',
      maxInputImages: 1,
      aspectRatios: [],
      resolutions: [],
    });
    expect(
      resolveImageModelProfile(
        { ...model, modelCode: 'imagen-4.0-generate-001', operation: 'image-generation' },
        { connectionType: 'google' },
        'image-generation'
      )
    ).toBeNull();
    const mini = resolveImageModelProfile(
      { ...model, modelCode: 'openai/gpt-image-1-mini' },
      provider,
      'image-editing'
    );
    expect(mini?.aspectRatios).toEqual(['1:1', '3:2', '2:3']);
    expect(
      mini &&
        acceptsImageContext(mini, {
          version: 1,
          intention: 'new-image',
          prompt: 'test',
          images: [],
          parameters: { variants: 1, aspectRatio: '16:9' },
        })
    ).toBe(false);
  });
  it('does not infer an operation from a known model name or image input', () => {
    expect(
      resolveImageModelProfile({ ...model, operation: 'text' }, provider, 'image-editing')
    ).toBeNull();
    expect(resolveImageModelProfile(model, provider, 'image-generation')).toBeNull();
    expect(
      resolveImageModelProfile(model, { ...provider, enabled: false }, 'image-editing')
    ).toBeNull();
  });
  it('exposes the verified cheap RouterAI profile without claiming masks or alpha', () => {
    const profile = resolveImageModelProfile(model, provider, 'image-editing');
    expect(profile).toMatchObject({
      transport: 'router-images',
      maxInputImages: 10,
      backgrounds: [],
      defaults: { variants: 1, resolution: '768', outputFormat: 'png' },
    });
    if (!profile) throw new Error('Expected image profile');
    const context: ImageContext = {
      version: 1,
      intention: 'new-image',
      prompt: 'test',
      images: [],
      parameters: { ...profile.defaults, variants: 3 },
    };
    expect(acceptsImageContext(profile, context)).toBe(true);
    expect(
      acceptsImageContext(profile, {
        ...context,
        parameters: { ...context.parameters, background: 'transparent' },
      })
    ).toBe(false);
    expect(
      acceptsImageContext(profile, {
        ...context,
        parameters: { ...context.parameters, size: '1024x1024' },
      })
    ).toBe(false);
  });
  it('does not apply RouterAI parameters to a different provider destination', () => {
    expect(
      resolveImageModelProfile(
        model,
        { ...provider, baseUrl: 'https://routerai.ru.example/api/v1' },
        'image-editing'
      )
    ).toBeNull();
    expect(
      resolveImageModelProfile({ ...model, modelCode: 'other' }, provider, 'image-editing')
    ).toMatchObject({ resolutions: [], aspectRatios: [], seed: false });
  });
  it('adapts native supported image protocols and keeps incompatible operations unavailable', () => {
    expect(
      resolveImageModelProfile(
        { ...model, modelCode: 'gpt-image-1-mini' },
        { ...provider, connectionType: 'openai', baseUrl: 'https://api.openai.com/v1' },
        'image-editing'
      )
    ).toMatchObject({ transport: 'sdk-images', maxInputImages: 16 });
    expect(
      resolveImageModelProfile(
        { ...model, modelCode: 'imagen-4.0-generate-001' },
        {
          ...provider,
          connectionType: 'google',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        },
        'image-editing'
      )
    ).toBeNull();
    expect(
      resolveImageModelProfile(
        model,
        { ...provider, connectionType: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
        'image-editing'
      )
    ).toMatchObject({ transport: 'chat-images' });
  });
});

it('accepts a sanitized RouterAI hint only when no authoritative baseUrl is present', () => {
  expect(getProviderImageApi('https://routerai.ru/api/v1/')).toBe('routerai');
  expect(getProviderImageApi('https://routerai.ru.evil.test/api/v1')).toBeUndefined();
  expect(getProviderImageApi('https://user:secret@routerai.ru/api/v1')).toBeUndefined();
  expect(
    resolveImageModelProfile(
      model,
      { connectionType: 'openai-compatible', imageApi: 'routerai' },
      'image-editing'
    )
  ).toMatchObject({ transport: 'router-images', defaults: { resolution: '768' } });
  expect(
    resolveImageModelProfile(
      model,
      {
        connectionType: 'openai-compatible',
        baseUrl: 'https://other.test/v1',
        imageApi: 'routerai',
      },
      'image-editing'
    )
  ).toBeNull();
});

it('provides known native output dimensions without inventing dimensions for unknown combinations', () => {
  const profile = resolveImageModelProfile(model, provider, 'image-editing');
  if (!profile) throw new Error('Expected profile');
  expect(
    getImageModelOutputSize(profile, { variants: 1, resolution: '768', aspectRatio: '1:1' })
  ).toEqual({ width: 768, height: 768 });
  expect(
    getImageModelOutputSize(profile, { variants: 1, resolution: '768', aspectRatio: '16:9' })
  ).toEqual({ width: 1024, height: 576 });
  expect(
    getImageModelOutputSize(profile, { variants: 1, resolution: '2K', aspectRatio: '16:9' })
  ).toBeNull();
  expect(
    getImageModelOutputSize(profile, { variants: 1, resolution: '2K', aspectRatio: '1:1' })
  ).toEqual({ width: 2048, height: 2048 });
});

it('rejects a Klein layer raster shorter than256pixels before dispatch', () => {
  const profile = resolveImageModelProfile(model, provider, 'image-editing')!;
  const context: ImageContext = {
    version: 1,
    intention: 'layers',
    prompt: 'Edit the layers',
    images: [{ role: 'source', dataUrl: 'synthetic-profile-input', width: 588, height: 195 }],
    parameters: { ...profile.defaults },
    editRegion: { left: 0, top: 0, width: 588, height: 195 },
  };
  expect(acceptsImageContext(profile, context)).toBe(false);
});

it('exposes verified GPT2.6 and Nano Banana2.1 image endpoints without unsupported raster parameters', () => {
  const gpt = resolveImageModelProfile(
    { ...model, modelCode: 'openai/gpt-image-2.6-sunburst' },
    provider,
    'image-editing'
  );
  const nano = resolveImageModelProfile(
    { ...model, modelCode: 'google/gemini-nano-banana-2.1' },
    provider,
    'image-editing'
  );
  expect(gpt).toMatchObject({
    transport: 'router-images',
    maxInputImages: 16,
    defaults: { variants: 1, aspectRatio: '1:1', quality: 'medium', outputFormat: 'png' },
    resolutions: [],
  });
  expect(nano).toMatchObject({
    transport: 'router-images',
    maxInputImages: 14,
    resolutions: ['1K', '2K', '4K'],
    qualities: [],
    defaults: { variants: 1, aspectRatio: '1:1', resolution: '1K' },
  });
  expect(nano?.aspectRatios).toHaveLength(14);
  expect(gpt?.formats).not.toContain('gif');
  for (const profile of [gpt, nano]) {
    if (!profile) throw new Error('Missing verified profile');
    const context: ImageContext = {
      version: 1,
      intention: 'new-image',
      prompt: 'test',
      images: [],
      parameters: profile.defaults,
    };
    expect(acceptsImageContext(profile, context)).toBe(true);
    expect(
      acceptsImageContext(profile, { ...context, parameters: { ...profile.defaults, seed: 1 } })
    ).toBe(false);
  }
});

it('chooses an enclosing supported ratio with the least extra area, independent of a square generation default', () => {
  const profile = resolveImageModelProfile(
    { ...model, modelCode: 'openai/gpt-image-2.6-sunburst' },
    provider,
    'image-editing'
  );
  expect(getImageEditFrameSize(profile, { width: 480, height: 280 })).toEqual({
    width: 512,
    height: 288,
  });
  const nano = resolveImageModelProfile(
    { ...model, modelCode: 'google/gemini-nano-banana-2.1' },
    provider,
    'image-editing'
  );
  expect(getImageEditFrameSize(nano, { width: 1024, height: 576 })).toEqual({
    width: 1024,
    height: 576,
  });
  const image = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
    width: 2,
    height: 3,
  };
  if (!nano) throw new Error('Missing profile');
  expect(
    acceptsImageContext(nano, {
      version: 1,
      intention: 'layers',
      prompt: 'test',
      images: Array.from({ length: 14 }, (_, i) => ({
        ...image,
        role: i ? 'reference' : 'source',
      })),
      parameters: nano.defaults,
      editMask: { mode: 'reference', image },
    })
  ).toBe(false);
});

it('selects native SDK size parameters automatically without mutating generation defaults', () => {
  const profile = resolveImageModelProfile(
    { operation: 'image-editing', modelCode: 'gpt-image-1' },
    { connectionType: 'openai' },
    'image-editing'
  );
  if (!profile) throw new Error('Missing SDK profile');
  const original = { ...profile.defaults, aspectRatio: '1:1' };
  const size = getImageEditFrameSize(profile, { width: 600, height: 300 });
  expect(size).toEqual({ width: 600, height: 400 });
  expect(getImageEditParameters(profile, size!, original)).toMatchObject({
    size: '1536x1024',
    aspectRatio: undefined,
  });
  expect(original.aspectRatio).toBe('1:1');
});
