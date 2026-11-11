import { generateImage } from 'ai';
import { z } from 'zod';
import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import {
  IMAGE_JOB_LIMITS,
  IMAGE_JOB_TIMEOUT_MS,
  imageRasterSchema,
  formatImageProviderPrompt,
  type ImageContext,
  type ImageRaster,
} from '../../../contracts/ai/image';
import {
  createAIProviderRuntime,
  AIProviderRequestError,
  classifyAIProviderHttpStatus,
  classifyAIProviderFailure,
} from '../providers';
import { createAIOperationObservation } from '../operation-observation';
import { createProviderSdkFetch } from '../llm/transport/http';
import type { ImageModelConfig } from './model-config';

interface ImageRequestResult {
  image: ImageRaster;
  costRub?: number;
}

const encodedImage = z
  .string()
  .min(1)
  .max(Math.ceil(IMAGE_JOB_LIMITS.maxImageBytes / 3) * 4);
const routerResponse = z.object({
  data: z
    .array(z.object({ b64_json: encodedImage }))
    .min(1)
    .max(1),
  usage: z.object({ cost: z.number().finite().nonnegative().optional() }).optional(),
});
const chatResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          images: z
            .array(
              z.object({
                image_url: z.object({
                  url: z.string().max(Math.ceil(IMAGE_JOB_LIMITS.maxImageBytes / 3) * 4 + 64),
                }),
              })
            )
            .min(1)
            .max(1),
        }),
      })
    )
    .min(1)
    .max(1),
});

function admitRaster(dataUrl: string): ImageRaster {
  const dimensions = readImageDataUrlDimensions(dataUrl, IMAGE_JOB_LIMITS.maxImageBytes);
  const parsed = dimensions && imageRasterSchema.safeParse({ dataUrl, ...dimensions });
  if (!parsed || !parsed.success) throw new Error('invalid-response');
  return parsed.data;
}

function admitBase64(value: string): ImageRaster {
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
    const dataUrl = `data:${mimeType};base64,${value}`;
    if (readImageDataUrlDimensions(dataUrl, IMAGE_JOB_LIMITS.maxImageBytes))
      return admitRaster(dataUrl);
  }
  throw new Error('invalid-response');
}

function buildChatImageRequest(modelCode: string, context: ImageContext) {
  const p = context.parameters;
  return {
    model: modelCode,
    modalities: ['image', 'text'],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: formatImageProviderPrompt(context) },
          ...context.images.map((image) => ({
            type: 'image_url',
            image_url: { url: image.dataUrl },
          })),
        ],
      },
    ],
    ...(p.aspectRatio || p.resolution
      ? {
          image_config: {
            ...(p.aspectRatio ? { aspect_ratio: p.aspectRatio } : {}),
            ...(p.resolution ? { image_size: p.resolution } : {}),
          },
        }
      : {}),
  };
}

function buildRouterImageRequest(modelCode: string, context: ImageContext) {
  const p = context.parameters;
  return {
    model: modelCode,
    prompt: formatImageProviderPrompt(context),
    n: 1,
    ...(context.images.length
      ? {
          input_references: context.images.map((image) => ({
            type: 'image_url',
            image_url: { url: image.dataUrl },
          })),
        }
      : {}),
    ...(p.aspectRatio ? { aspect_ratio: p.aspectRatio } : {}),
    ...(p.resolution ? { resolution: p.resolution } : {}),
    ...(p.quality ? { quality: p.quality } : {}),
    ...(p.outputFormat ? { output_format: p.outputFormat } : {}),
    ...(p.background ? { background: p.background } : {}),
    ...(p.seed !== undefined ? { seed: p.seed } : {}),
  };
}

function parseJsonImageResponse(chat: boolean, raw: unknown): ImageRequestResult {
  if (chat) {
    const parsed = chatResponse.safeParse(raw);
    if (!parsed.success) throw new Error('invalid-response');
    const url = parsed.data.choices[0]?.message.images[0]?.image_url.url;
    if (!url) throw new Error('invalid-response');
    return { image: admitRaster(url) };
  }
  const parsed = routerResponse.safeParse(raw);
  const image = parsed.success && parsed.data.data[0];
  if (!parsed.success || !image) throw new Error('invalid-response');
  const cost = parsed.data.usage?.cost;
  return { image: admitBase64(image.b64_json), ...(cost !== undefined ? { costRub: cost } : {}) };
}

async function requestJson(
  config: ImageModelConfig,
  context: ImageContext,
  fetcher: typeof globalThis.fetch,
  signal: AbortSignal
): Promise<ImageRequestResult> {
  const chat = config.profile.transport === 'chat-images';
  const body = chat
    ? buildChatImageRequest(config.modelCode, context)
    : buildRouterImageRequest(config.modelCode, context);
  const response = await fetcher(
    `${config.baseUrl.replace(/\/+$/u, '')}/${chat ? 'chat/completions' : 'images'}`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) throw new AIProviderRequestError(classifyAIProviderHttpStatus(response.status));
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error('invalid-response');
  }
  return parseJsonImageResponse(chat, raw);
}

async function requestSdk(
  config: ImageModelConfig,
  context: ImageContext,
  fetcher: typeof globalThis.fetch,
  signal: AbortSignal
): Promise<ImageRequestResult> {
  const operation = context.images.length ? 'image-editing' : 'image-generation';
  const runtime = createAIProviderRuntime({
    type: config.connectionType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    operation,
    fetch: fetcher,
  });
  const model = runtime.imageModel?.(config.modelCode);
  if (!model) throw new Error('model-unavailable');
  const p = context.parameters;
  const ratio = p.aspectRatio?.split(':').map(Number);
  const aspectRatio: `${number}:${number}` | undefined =
    ratio?.[0] !== undefined && ratio[1] !== undefined ? `${ratio[0]}:${ratio[1]}` : undefined;
  const result = await generateImage({
    model,
    n: 1,
    maxImagesPerCall: 1,
    maxRetries: 0,
    abortSignal: signal,
    prompt: context.images.length
      ? {
          text: formatImageProviderPrompt(context),
          images: context.images.map((image) =>
            image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
          ),
        }
      : formatImageProviderPrompt(context),
    ...(p.size ? { size: p.size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(p.seed !== undefined ? { seed: p.seed } : {}),
    providerOptions: {
      openai: {
        ...(p.quality ? { quality: p.quality } : {}),
        ...(p.outputFormat ? { outputFormat: p.outputFormat } : {}),
        ...(p.background ? { background: p.background } : {}),
      },
    },
  });
  if (result.images.length !== 1 || !result.images[0]) throw new Error('invalid-response');
  return { image: admitBase64(result.images[0].base64) };
}

/** Keeps fixed failure codes and discards provider payloads, headers and error causes. */
function sanitizeImageRequestFailure(error: unknown, aborted: boolean): Error {
  if (aborted) return new Error('cancelled');
  if (
    error instanceof Error &&
    [
      'invalid-response',
      'model-unavailable',
      'stale',
      'secret-unavailable',
      'permission-denied',
      'invalid-request',
    ].includes(error.message)
  )
    return new Error(error.message);
  if (error instanceof Error && error.message === 'provider-response-too-large')
    return new Error('too-large');
  const reason = classifyAIProviderFailure(error);
  return new AIProviderRequestError(
    reason,
    reason === 'network' ? 'network-failed' : reason === 'timeout' ? 'timeout' : 'provider-failed'
  );
}

/** Sends exactly one paid request. Credentials, prompt and provider error bodies never leave this owner. */
export async function requestImage(options: {
  config: ImageModelConfig;
  context: ImageContext;
  signal: AbortSignal;
  beforeSend(): Promise<void>;
}): Promise<ImageRequestResult> {
  const { config, context, signal } = options;
  const observation = createAIOperationObservation({ binding: config.observationBinding, signal });
  const guardedFetch = createProviderSdkFetch({
    baseUrl: config.baseUrl,
    signal,
    maxResponseBytes: IMAGE_JOB_LIMITS.maxResponseBytes,
    timeoutMs: IMAGE_JOB_TIMEOUT_MS,
    transport: observation.fetch,
    beforeSend: async () => {
      await observation.admit();
      signal.throwIfAborted();
      await options.beforeSend();
    },
  });
  let dispatched = false;
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    // SDK adapters may download provider URLs before returning normalized image results.
    if (method.toUpperCase() !== 'POST' || dispatched) throw new Error('invalid-response');
    dispatched = true;
    return guardedFetch(input, init);
  };
  try {
    const result =
      config.profile.transport === 'sdk-images'
        ? await requestSdk(config, context, fetcher, signal)
        : await requestJson(config, context, fetcher, signal);
    signal.throwIfAborted();
    await observation.observe({ kind: 'success' });
    signal.throwIfAborted();
    return result;
  } catch (error) {
    const failure = sanitizeImageRequestFailure(error, signal.aborted);
    if (failure instanceof AIProviderRequestError)
      await observation.observe({ kind: 'failure', reason: failure.reason });
    throw failure;
  }
}
