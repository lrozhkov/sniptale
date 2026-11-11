import type { AIProviderType } from '../settings/ai-provider';
import {
  supportsAIProviderModelOperation,
  type AIModelOperationSubject,
} from '../settings/model-operation';
import { imageParametersSchema, type ImageContext, type ImageParameters } from './image';

export interface ImageModelProfile {
  transport: 'router-images' | 'chat-images' | 'sdk-images';
  maxInputImages: number;
  minInputSide?: number;
  editMask?: 'alpha' | 'reference';
  aspectRatios: readonly string[];
  resolutions: readonly NonNullable<ImageParameters['resolution']>[];
  sizes: readonly NonNullable<ImageParameters['size']>[];
  qualities: readonly NonNullable<ImageParameters['quality']>[];
  formats: readonly NonNullable<ImageParameters['outputFormat']>[];
  backgrounds: readonly NonNullable<ImageParameters['background']>[];
  seed: boolean;
  defaults: ImageParameters;
  expectedOutputSizes: ReadonlyArray<{
    resolution: ImageParameters['resolution'];
    aspectRatio: string;
    width: number;
    height: number;
  }>;
}

type ProfileModel = AIModelOperationSubject & { modelCode: string };
type ProfileProvider = {
  connectionType: AIProviderType;
  baseUrl?: string;
  imageApi?: 'routerai' | undefined;
  enabled?: boolean | undefined;
  management?: 'automatic' | 'manual' | undefined;
};

const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
const FLUX_RATIOS = [...RATIOS, '9:21', '2:1', '1:2', '5:4', '4:5', '7:5', '5:7'];
const emptyProfile: ImageModelProfile = {
  transport: 'sdk-images',
  maxInputImages: 0,
  aspectRatios: [],
  resolutions: [],
  sizes: [],
  qualities: [],
  formats: [],
  backgrounds: [],
  seed: false,
  defaults: { variants: 1 },
  expectedOutputSizes: [],
};

/** Returns a non-secret protocol hint for the sanitized model-selection bootstrap. */
export function getProviderImageApi(baseUrl: string): 'routerai' | undefined {
  try {
    const url = new URL(baseUrl);
    return url.origin === 'https://routerai.ru' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.replace(/\/+$/u, '') === '/api/v1'
      ? 'routerai'
      : undefined;
  } catch {
    return undefined;
  }
}

/** Intersects declared operations with protocol profiles; model names never grant an operation. */
export function resolveImageModelProfile(
  model: ProfileModel,
  provider: ProfileProvider,
  operation: 'image-generation' | 'image-editing'
): ImageModelProfile | null {
  if (!supportsAIProviderModelOperation(model, provider, operation)) return null;
  if (
    (provider.baseUrl === undefined ? provider.imageApi : getProviderImageApi(provider.baseUrl)) ===
    'routerai'
  )
    return routerProfile(model);
  if (provider.connectionType === 'openrouter') {
    return { ...emptyProfile, transport: 'chat-images', maxInputImages: 16 };
  }
  if (provider.connectionType === 'google') {
    // Current native Google image models require generateContent, which this adapter does not implement.
    return null;
  }
  if (provider.connectionType === 'openai' || provider.connectionType === 'openai-compatible') {
    if (model.modelCode.startsWith('gpt-image-')) {
      return {
        ...emptyProfile,
        maxInputImages: 16,
        sizes: ['1024x1024', '1536x1024', '1024x1536'],
        qualities: ['low', 'medium', 'high'],
        formats: ['png', 'jpeg', 'webp'],
        backgrounds: ['opaque', 'transparent'],
        defaults: { variants: 1, size: '1024x1024', outputFormat: 'png' },
      };
    }
    if (operation === 'image-editing') return null;
    return { ...emptyProfile };
  }
  if (provider.connectionType === 'xai') return { ...emptyProfile, maxInputImages: 1 };
  return null;
}

function routerProfile(model: ProfileModel): ImageModelProfile {
  const modelCode = model.modelCode;
  const base: ImageModelProfile = {
    ...emptyProfile,
    transport: 'router-images',
    maxInputImages: 1,
  };
  if (modelCode === 'black-forest-labs/flux-3-image-klein')
    return {
      ...base,
      maxInputImages: 10,
      minInputSide: 256,
      aspectRatios: FLUX_RATIOS,
      resolutions: ['768', '1K', '1.5K', '2K', '4K'],
      formats: ['png', 'jpeg'],
      seed: true,
      defaults: { variants: 1, aspectRatio: '1:1', resolution: '768', outputFormat: 'png' },
      expectedOutputSizes: [
        { resolution: '768', aspectRatio: '1:1', width: 768, height: 768 },
        { resolution: '1K', aspectRatio: '1:1', width: 1024, height: 1024 },
        { resolution: '1.5K', aspectRatio: '1:1', width: 1536, height: 1536 },
        { resolution: '2K', aspectRatio: '1:1', width: 2048, height: 2048 },
        { resolution: '4K', aspectRatio: '1:1', width: 4096, height: 4096 },
        { resolution: '768', aspectRatio: '16:9', width: 1024, height: 576 },
      ],
    };
  if (modelCode === 'recraft/recraft-v4.1-flash')
    return {
      ...base,
      maxInputImages: 0,
      aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
      defaults: { variants: 1, aspectRatio: '1:1' },
    };
  if (modelCode === 'google/gemini-3.1-flash-lite-image')
    return {
      ...base,
      transport: 'chat-images',
      maxInputImages: 14,
      aspectRatios: RATIOS,
      resolutions: ['1K'],
      defaults: { variants: 1, aspectRatio: '1:1', resolution: '1K' },
    };
  if (modelCode === 'openai/gpt-image-2.6-sunburst')
    return {
      ...base,
      maxInputImages: 16,
      editMask: 'alpha',
      aspectRatios: RATIOS,
      qualities: ['low', 'medium', 'high'],
      formats: ['png', 'jpeg', 'webp'],
      backgrounds: ['opaque', 'transparent'],
      defaults: { variants: 1, aspectRatio: '1:1', outputFormat: 'png', quality: 'medium' },
    };
  if (modelCode === 'google/gemini-nano-banana-2.1')
    return {
      ...base,
      maxInputImages: 14,
      aspectRatios: [...RATIOS, '4:5', '5:4', '1:4', '4:1', '1:8', '8:1'],
      resolutions: ['1K', '2K', '4K'],
      defaults: { variants: 1, aspectRatio: '1:1', resolution: '1K' },
    };
  if (modelCode === 'openai/gpt-image-1-mini')
    return {
      ...base,
      maxInputImages: 16,
      editMask: 'alpha',
      aspectRatios: ['1:1', '3:2', '2:3'],
      qualities: ['low', 'medium', 'high'],
      formats: ['png', 'jpeg', 'webp'],
      backgrounds: ['opaque', 'transparent'],
      defaults: { variants: 1, outputFormat: 'png', quality: 'low' },
    };
  // Unknown remote parameters stay hidden. The endpoint supplies its own defaults.
  const capabilities = model.capabilities ?? model.catalog?.capabilities;
  return capabilities?.output.image === 'supported' && capabilities.output.text === 'supported'
    ? { ...base, transport: 'chat-images' }
    : base;
}

/** Returns a known output canvas. A differing actual response still requires explicit recovery. */
export function getImageModelOutputSize(
  profile: ImageModelProfile,
  parameters: ImageParameters
): { width: number; height: number } | null {
  if (parameters.size && profile.sizes.includes(parameters.size)) {
    const [width, height] = parameters.size.split('x').map(Number);
    if (width && height) return { width, height };
  }
  const size = profile.expectedOutputSizes.find(
    (entry) =>
      entry.resolution === parameters.resolution && entry.aspectRatio === parameters.aspectRatio
  );
  return size ? { width: size.width, height: size.height } : null;
}

/** Rejects stale UI options before any paid dispatch. Variants are separate n=1 calls. */
export function acceptsImageContext(profile: ImageModelProfile, context: ImageContext): boolean {
  if (
    !imageParametersSchema.safeParse(context.parameters).success ||
    context.images.length + (context.editMask?.mode === 'reference' ? 1 : 0) >
      profile.maxInputImages ||
    (context.editMask !== undefined && context.editMask.mode !== (profile.editMask ?? 'reference'))
  )
    return false;
  const minimumSide = profile.minInputSide ?? 1;
  if (context.images.some((image) => image.width < minimumSide || image.height < minimumSide))
    return false;
  const p = context.parameters;
  const choices: Array<[string | undefined, readonly string[]]> = [
    [p.aspectRatio, profile.aspectRatios],
    [p.resolution, profile.resolutions],
    [p.size, profile.sizes],
    [p.quality, profile.qualities],
    [p.outputFormat, profile.formats],
    [p.background, profile.backgrounds],
  ];
  if (choices.some(([value, allowed]) => value !== undefined && !allowed.includes(value)))
    return false;
  if (p.background === 'transparent' && p.outputFormat === 'jpeg') return false;
  return p.seed === undefined || profile.seed;
}

/** Returns only the transparent input margins required by a known model minimum. */
export function getImageModelInputSize(
  profile: ImageModelProfile | null,
  image: { width: number; height: number }
): { width: number; height: number } | null {
  const side = profile?.minInputSide ?? 1;
  return image.width < side || image.height < side
    ? { width: Math.max(side, image.width), height: Math.max(side, image.height) }
    : null;
}

/** Expands a working frame to a supported ratio without scaling its source pixels. */
export function getImageEditFrameSize(
  profile: ImageModelProfile | null,
  bounds: { width: number; height: number }
): { width: number; height: number } | null {
  if (!profile) return null;
  const ratios = profile.aspectRatios.length
    ? profile.aspectRatios
    : profile.sizes
        .map((size) => {
          const [width, height] = size.split('x').map(Number);
          if (!width || !height) return '';
          let a = width,
            b = height;
          while (b) {
            const remainder = a % b;
            a = b;
            b = remainder;
          }
          return `${width / a}:${height / a}`;
        })
        .filter(Boolean);
  if (!ratios.length) return getImageModelInputSize(profile, bounds);
  const minimum = profile.minInputSide ?? 1;
  let best: { width: number; height: number } | null = null;
  for (const ratio of ratios) {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) continue;
    const unit = Math.ceil(Math.max(bounds.width / w, bounds.height / h, minimum / w, minimum / h));
    const size = { width: w * unit, height: h * unit };
    if (!best || size.width * size.height < best.width * best.height) best = size;
  }
  return best;
}

/** Uses the transport's ratio or size field for an automatically prepared local-edit frame. */
export function getImageEditParameters(
  profile: ImageModelProfile,
  frame: { width: number; height: number },
  current: ImageParameters
): ImageParameters {
  const matches = (w: number | undefined, h: number | undefined) =>
    w && h && Math.abs(frame.width / frame.height - w / h) < 0.000001;
  const aspectRatio = profile.aspectRatios.find((ratio) => {
    const [w, h] = ratio.split(':').map(Number);
    return matches(w, h);
  });
  const size = !aspectRatio
    ? profile.sizes.find((size) => {
        const [w, h] = size.split('x').map(Number);
        return matches(w, h);
      })
    : undefined;
  return { ...current, aspectRatio, size };
}
