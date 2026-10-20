import { useCallback, useEffect, useRef, useState } from 'react';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import { createReviewWatermarkImageAttachment } from '../../workflows/video-review/watermark-image';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import {
  createQuickEditWatermark,
  parseQuickEditWatermark,
  type QuickEditWatermarkSettings,
} from '../../features/video/project/scene/watermark';
import { translate } from '../../platform/i18n';

type Session = ReturnType<typeof createVideoReviewSession>;
type Settings = QuickEditWatermarkSettings;
type Attachment = ReturnType<typeof createReviewWatermarkImageAttachment>;
type ImageOperation = {
  file: File;
  origin?: string;
  attachment: Attachment;
  attempt: { signal: AbortSignal };
};
type Lifecycle = {
  session: Session;
  controller: AbortController;
  busy: boolean;
  retained: ImageOperation | null;
};
function createLifecycle(session: Session): Lifecycle {
  return { session, controller: new AbortController(), busy: false, retained: null };
}

/** Parameters use the shared debounced writer; image publication remains a durable transaction. */
export function useReviewWatermark(args: {
  session: Session;
  settings: Settings | undefined;
  flushAdvanced(): Promise<void>;
  stageSettings(settings: Settings | undefined): void;
  allowed(): boolean;
  pause(): void;
}) {
  const current = useRef(args);
  current.current = args;
  const lifecycle = useRef<Lifecycle | null>(null);
  lifecycle.current ??= createLifecycle(args.session);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resources = useWatermarkResourceRecovery(args.session);
  const { resourceError, resourceRetryGeneration, onResourceError } = resources;
  const imagePreviewUrl = useWatermarkImagePreview(
    args.session,
    args.settings?.image?.assetId,
    resourceRetryGeneration
  );
  useEffect(() => {
    if (lifecycle.current?.session !== args.session || lifecycle.current.controller.signal.aborted)
      lifecycle.current = createLifecycle(args.session);
    const owner = lifecycle.current;
    setDraft(null);
    setPending(false);
    setError(null);
    return () => owner.controller.abort();
  }, [args.session]);
  useEffect(() => setDraft(null), [args.settings]);
  const assertCurrent = (owner: Lifecycle, signal: AbortSignal) => {
    signal.throwIfAborted();
    owner.controller.signal.throwIfAborted();
    if (lifecycle.current !== owner || current.current.session !== owner.session)
      throw new Error('Watermark project changed');
  };
  const save = (settings: Settings | undefined, session: Session, signal: AbortSignal) =>
    saveWatermark(settings, session, signal, current);
  const editable = () => {
    const owner = lifecycle.current;
    return (
      owner !== null &&
      !owner.busy &&
      !owner.controller.signal.aborted &&
      owner.session === current.current.session &&
      current.current.session === args.session &&
      current.current.allowed()
    );
  };
  const run = async (
    action: (owner: Lifecycle, signal: AbortSignal) => Promise<void>,
    acquisitionSignal?: AbortSignal
  ) => {
    const owner = lifecycle.current;
    if (!owner || !editable()) return false;
    const signal = acquisitionSignal
      ? AbortSignal.any([owner.controller.signal, acquisitionSignal])
      : owner.controller.signal;
    owner.busy = true;
    setPending(true);
    setError(null);
    current.current.pause();
    try {
      assertCurrent(owner, signal);
      await action(owner, signal);
      assertCurrent(owner, signal);
      setDraft(null);
      return true;
    } catch (failure) {
      if (lifecycle.current === owner && !signal.aborted)
        setError(translate('gallery.videoReview.saveFailed'));
      throw failure;
    } finally {
      owner.busy = false;
      if (lifecycle.current === owner && !owner.controller.signal.aborted) setPending(false);
    }
  };
  const change = async (settings: Settings | undefined): Promise<boolean> => {
    const owner = lifecycle.current;
    if (!owner || owner.retained || !editable()) return false;
    const parsed = settings === undefined ? undefined : parseQuickEditWatermark(settings);
    if (parsed === null) return false;
    current.current.pause();
    current.current.stageSettings(parsed);
    setDraft(null);
    setError(null);
    return true;
  };
  const image = (file: File, originMediaId?: string, acquisitionSignal?: AbortSignal) =>
    run(async (owner, signal) => {
      await attachWatermarkImage({
        owner,
        signal,
        file,
        originMediaId,
        save,
        assertCurrent,
        settings: () => current.current.settings,
      });
      // Durable attachment can notify consumers before its bytes become published.
      resources.retry();
    }, acquisitionSignal).then(() => undefined);
  const retained = lifecycle.current.retained;
  const retryResource = async () => {
    if (
      current.current.session !== args.session ||
      lifecycle.current?.busy ||
      lifecycle.current?.controller.signal.aborted
    )
      return;
    resources.retry();
  };
  return {
    settings: draft ?? args.settings,
    pending,
    error: error ?? resourceError,
    imagePreviewUrl,
    resourceRetryGeneration,
    onResourceError,
    setError: (message: string | null) => {
      if (current.current.session === args.session && !lifecycle.current?.controller.signal.aborted)
        setError(message);
    },
    preview: (settings: Settings | null) => {
      if (!editable()) return;
      current.current.pause();
      setDraft(settings);
    },
    change,
    image,
    retry: retained
      ? () => image(retained.file, retained.origin)
      : resourceError
        ? retryResource
        : undefined,
  };
}

function reusableImageOperation(
  operation: ImageOperation | null,
  file: File,
  origin: string | undefined
) {
  if (!operation?.attachment.hasRetainedAsset()) return null;
  if (operation.file !== file || operation.origin !== origin)
    throw new Error('Finish the retained watermark attachment first');
  return operation;
}

async function readLogoDimensions(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function createImageOperation(args: {
  owner: Lifecycle;
  file: File;
  originMediaId: string | undefined;
  signal: AbortSignal;
  dimensions: { width: number; height: number };
  initial: Settings;
  save(settings: Settings, session: Session, signal: AbortSignal): Promise<void>;
  assertCurrent(owner: Lifecycle, signal: AbortSignal): void;
}): ImageOperation {
  const { owner, initial, dimensions } = args;
  const attempt = { signal: args.signal };
  return {
    file: args.file,
    ...(args.originMediaId ? { origin: args.originMediaId } : {}),
    attempt,
    attachment: createReviewWatermarkImageAttachment({
      file: args.file,
      ...(args.originMediaId ? { originMediaId: args.originMediaId } : {}),
      aggregateId: owner.session.getSnapshot().snapshot.workspace.aggregateId,
      signal: owner.controller.signal,
      assertCurrentTarget: () => args.assertCurrent(owner, attempt.signal),
      attach: (assetId) =>
        args.save(
          {
            ...initial,
            mode: 'image',
            image: {
              assetId,
              ...dimensions,
              size: initial.image?.size ?? 0.2,
              opacity: initial.image?.opacity ?? 1,
            },
          },
          owner.session,
          attempt.signal
        ),
    }),
  };
}

/** The remembered immutable image owns one thumbnail URL, independent of mode and gestures. */
function useWatermarkImagePreview(
  session: Session,
  assetId: string | undefined,
  generation: number
) {
  const [preview, setPreview] = useState<{ assetId: string; session: Session; url: string }>();
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setPreview(undefined);
    if (assetId)
      void resolveReviewAssetBytes(assetId)
        .then((blob) => {
          if (!active || !blob) return;
          url = URL.createObjectURL(blob);
          setPreview({ assetId, session, url });
        })
        .catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, assetId, generation]);
  return preview?.assetId === assetId && preview?.session === session ? preview.url : undefined;
}

async function saveWatermark(
  settings: Settings | undefined,
  session: Session,
  signal: AbortSignal,
  current: { current: { session: Session; flushAdvanced(): Promise<void> } }
) {
  if (settings && !parseQuickEditWatermark(settings)) throw new Error('Invalid watermark settings');
  signal.throwIfAborted();
  await current.current.flushAdvanced();
  signal.throwIfAborted();
  if (current.current.session !== session) throw new Error('Watermark project changed');
  const before = session.getSnapshot().document.advancedContent;
  const { watermark: _previous, ...rest } = before;
  const after = settings ? { ...rest, watermark: settings } : rest;
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  try {
    await session.commitDurable({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after,
    });
  } catch (failure) {
    // A failed response can follow a durable write. Reconcile the session before any retry.
    if (!signal.aborted && current.current.session === session) {
      try {
        await session.reload();
      } catch {
        /* Keep the original failed action visible. */
      }
    }
    throw failure;
  }
}

/** Renderer recovery never changes authored settings or the attachment transaction. */
function useWatermarkResourceRecovery(session: Session) {
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [resourceRetryGeneration, setResourceRetryGeneration] = useState(0);
  const current = useRef({ session, generation: resourceRetryGeneration });
  current.current = { session, generation: resourceRetryGeneration };
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    setResourceError(null);
    return () => {
      active.current = false;
    };
  }, [session]);
  const onResourceError = useCallback(
    (message: string | null) => {
      if (
        active.current &&
        current.current.session === session &&
        current.current.generation === resourceRetryGeneration
      )
        setResourceError(message);
    },
    [session, resourceRetryGeneration]
  );
  return {
    resourceError,
    resourceRetryGeneration,
    onResourceError,
    retry: () => setResourceRetryGeneration((generation) => generation + 1),
  };
}

/** One acquisition retains its prepared attachment until publication succeeds. */
async function attachWatermarkImage(args: {
  owner: Lifecycle;
  signal: AbortSignal;
  file: File;
  originMediaId: string | undefined;
  settings(): Settings | undefined;
  save(settings: Settings, session: Session, signal: AbortSignal): Promise<void>;
  assertCurrent(owner: Lifecycle, signal: AbortSignal): void;
}) {
  const { owner, signal, file, originMediaId, save, assertCurrent } = args;
  let operation = reusableImageOperation(owner.retained, file, originMediaId);
  if (!operation) {
    const dimensions = await readLogoDimensions(file);
    assertCurrent(owner, signal);
    const initial =
      args.settings() ?? createQuickEditWatermark(translate('gallery.videoReview.watermarkSeed'));
    operation = createImageOperation({
      owner,
      file,
      originMediaId,
      signal,
      dimensions,
      initial,
      save,
      assertCurrent,
    });
    owner.retained = operation;
  }
  operation.attempt.signal = signal;
  await operation.attachment.run();
  assertCurrent(owner, signal);
  owner.retained = null;
}
