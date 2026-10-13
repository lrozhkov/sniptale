import {
  ACTION_SOUND_CATALOG,
  isActionSoundSampleId,
  type ActionSoundSampleId,
} from '../../features/video/review/action-audio-catalog';
import {
  ReviewActionAudioUnavailable,
  reviewActionAudioAdmission,
  type ReviewActionAudioPlan,
} from '../../features/video/review/action-audio';

interface DecodedActionSample {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
}

/** The existing preview/export lifetime owns cancellation and releases this bounded cache. */
export interface ReviewActionAudioSource<Buffer> {
  read(sampleId: unknown): Promise<Buffer>;
  dispose(): void;
}

/** Whole-main admission yields between memory batches; querying a fragment cannot change its gain. */
export async function admitReviewActionAudioPlan(plan: ReviewActionAudioPlan, signal: AbortSignal) {
  const iterator = reviewActionAudioAdmission(plan);
  let yieldAt = performance.now() + 8;
  while (true) {
    signal.throwIfAborted();
    const next = iterator.next();
    if (next.done) return next.value;
    if (performance.now() >= yieldAt) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      yieldAt = performance.now() + 8;
    }
  }
}

/** Job/session-local, lazy cache; persisted input can select identities but never URLs. */
export function createReviewActionAudioSource<Buffer extends DecodedActionSample>(deps: {
  signal: AbortSignal;
  getURL(path: string): string;
  fetch: typeof fetch;
  decode(data: ArrayBuffer, signal: AbortSignal): Promise<Buffer>;
}): ReviewActionAudioSource<Buffer> {
  const cache = new Map<ActionSoundSampleId, Promise<Buffer>>();
  const controller = new AbortController();
  const dispose = () => {
    controller.abort();
    cache.clear();
    deps.signal.removeEventListener('abort', dispose);
  };
  deps.signal.addEventListener('abort', dispose, { once: true });
  const check = () => {
    deps.signal.throwIfAborted();
    controller.signal.throwIfAborted();
  };
  const load = async (sampleId: ActionSoundSampleId): Promise<Buffer> => {
    const sample = ACTION_SOUND_CATALOG[sampleId];
    let response: Response;
    try {
      response = await deps.fetch(deps.getURL(sample.path), {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      });
    } catch (error) {
      check();
      throw new ReviewActionAudioUnavailable('resource-missing', { cause: error });
    }
    try {
      check();
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new ReviewActionAudioUnavailable('resource-missing');
    }
    const declared = response.headers.get('Content-Length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== sample.size)) {
      await response.body.cancel();
      throw new ReviewActionAudioUnavailable('resource-invalid');
    }
    const bytes = new Uint8Array(sample.size);
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    controller.signal.addEventListener('abort', cancel, { once: true });
    let length = 0;
    try {
      check();
      while (true) {
        const next = await reader.read();
        check();
        if (next.done) break;
        if (length + next.value.byteLength > bytes.length)
          throw new ReviewActionAudioUnavailable('resource-invalid');
        bytes.set(next.value, length);
        length += next.value.byteLength;
      }
      if (length !== bytes.length) throw new ReviewActionAudioUnavailable('resource-invalid');
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
    check();
    const hex = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, '0')
    ).join('');
    if (hex !== sample.sha256) throw new ReviewActionAudioUnavailable('resource-invalid');
    let decoded: Buffer;
    try {
      decoded = await deps.decode(bytes.buffer, controller.signal);
    } catch (error) {
      check();
      throw new ReviewActionAudioUnavailable('resource-invalid', { cause: error });
    }
    check();
    if (
      decoded.sampleRate !== sample.sampleRate ||
      decoded.length !== sample.durationFrames ||
      decoded.numberOfChannels !== 1
    )
      throw new ReviewActionAudioUnavailable('resource-invalid');
    return decoded;
  };
  return {
    dispose,
    async read(sampleId: unknown): Promise<Buffer> {
      check();
      if (!isActionSoundSampleId(sampleId))
        throw new ReviewActionAudioUnavailable('resource-invalid');
      let pending = cache.get(sampleId);
      if (!pending) {
        pending = load(sampleId);
        cache.set(sampleId, pending);
      }
      try {
        const buffer = await pending;
        check();
        return buffer;
      } catch (error) {
        if (cache.get(sampleId) === pending) cache.delete(sampleId);
        check();
        if (error instanceof ReviewActionAudioUnavailable) throw error;
        throw new ReviewActionAudioUnavailable('resource-invalid', { cause: error });
      }
    },
  };
}
