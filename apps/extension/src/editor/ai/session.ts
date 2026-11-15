import { getImageEditParameters, type ImageModelProfile } from '../../contracts/ai/image-profile';
import { reframeEditorRaster } from '../controller/layer-effects/rasterize/capture';
import { padImageBounds } from '../controller/ai-image/geometry';
import { imageRasterRegion } from '../controller/ai-image/geometry';
import {
  IMAGE_JOB_FAILURE_CODES,
  imageContextSchema,
  imageRasterSchema,
  type ImageContext,
  type ImageParameters,
  type ImageRaster,
} from '../../contracts/ai/image';
import {
  captureImageEditorSnapshot,
  createEditorImageMask,
  prepareImageEditorSnapshot,
} from '../controller/ai-image/snapshot';
import {
  applyImageEditorResult,
  type ImageResultFitting,
  canUpdateImageResult,
  isImageApplyResultPresent,
} from '../controller/ai-image/apply';
import type {
  EditorImageSnapshot,
  ImageApplyController,
  ImageApplyReceipt,
  ImageBounds,
  ImageCaptureContext,
  ImageIntention,
} from '../controller/ai-image/types';
import { runImageEditorJob, ImageJobError, type ImageJobDiagnostic } from './client';
import { openGeneratedImageDocument } from '../workflows/open-generated-image-document';

const MAX_STEPS_PER_OPERATION = 10;
const MAX_SESSION_STEPS = 50;
const MAX_SESSION_ENCODED_BYTES = 100 * 1024 * 1024;
const failures: readonly string[] = [
  ...IMAGE_JOB_FAILURE_CODES,
  'source-unavailable',
  'unsupported-selection',
  'choose-region',
  'invalid-region',
  'capture-unavailable',
  'size-mismatch',
  'transparent-region',
  'stale-document',
  'stale-source',
  'changed-result',
  'apply-unavailable',
  'session-limit',
  'output-too-small',
  'source-not-prepared',
  'model-choice-required',
  'open-document-failed',
];

interface ImageSessionVariant {
  image: ImageRaster;
  durationMs: number;
  costRub?: number;
}
interface ImageSessionStep {
  id: string;
  startedAt: number;
  operationId: string;
  snapshot: EditorImageSnapshot;
  context: ImageContext;
  modelLabel: string;
  model: ImageSessionModel;
  variants: Array<ImageSessionVariant | null>;
  applied: boolean;
}
export interface ImageSessionState {
  draft: {
    intention: ImageIntention;
    context: ImageCaptureContext;
    regionSource: 'canvas' | 'source';
    prompt: string;
    parameters: ImageParameters;
    references: ImageRaster[];
  };
  source: EditorImageSnapshot | null;
  steps: ImageSessionStep[];
  selected: { stepId: string; variant: number } | null;
  base: { stepId: string; variant: number } | null;
  operationId: string;
  status: 'idle' | 'preparing' | 'generating' | 'applying' | 'opening';
  error: string | null;
  diagnostic: ImageJobDiagnostic | null;
}
interface ImageSessionModel {
  modelId: string;
  modelCode: string;
  providerId: string;
  destinationBinding: string;
  label: string;
}
interface Dependencies {
  capture: typeof captureImageEditorSnapshot;
  mask: typeof createEditorImageMask;
  prepare: typeof prepareImageEditorSnapshot;
  apply: typeof applyImageEditorResult;
  run: typeof runImageEditorJob;
  openDocument: typeof openGeneratedImageDocument;
}
function initialState(): ImageSessionState {
  return {
    draft: {
      intention: 'new-image',
      context: 'region',
      regionSource: 'canvas',
      prompt: '',
      parameters: { variants: 1 },
      references: [],
    },
    source: null,
    steps: [],
    selected: null,
    base: null,
    operationId: crypto.randomUUID(),
    status: 'idle',
    error: null,
    diagnostic: null,
  };
}
function failureCode(error: unknown): string {
  return error instanceof Error && failures.includes(error.message)
    ? error.message
    : 'invalid-request';
}

async function prepareImageReference(image: ImageRaster, minimumSide: number, signal: AbortSignal) {
  if (image.width >= minimumSide && image.height >= minimumSide) return image;
  const bounds = { left: 0, top: 0, width: image.width, height: image.height };
  const padded = padImageBounds(bounds, {
    width: Math.max(image.width, minimumSide),
    height: Math.max(image.height, minimumSide),
  });
  return reframeEditorRaster(image, bounds, bounds, padded, signal);
}

function buildImageContext(
  source: EditorImageSnapshot,
  draft: ImageSessionState['draft'],
  base: ImageRaster | null,
  mask?: ImageContext['editMask']
): ImageContext {
  return imageContextSchema.parse({
    version: 1,
    intention: source.intention,
    prompt: draft.prompt,
    images: [
      ...(base ? [{ ...base, role: 'source' }] : []),
      ...draft.references.map((image) => ({ ...image, role: 'reference' })),
    ],
    ...(mask ? { editMask: mask } : {}),
    parameters: Object.fromEntries(
      Object.entries(draft.parameters).filter(([, value]) => value !== undefined)
    ),
    ...(source.intention !== 'new-image'
      ? {
          editRegion: base
            ? imageRasterRegion(source.inputBounds, source.targetBounds, base)
            : undefined,
        }
      : {}),
  });
}

function assertSessionBudget(
  steps: ImageSessionStep[],
  source: EditorImageSnapshot | null,
  references: ImageRaster[]
) {
  const rasters: string[] = [];
  if (source?.raster) rasters.push(source.raster.dataUrl);
  if (source?.captureRaster) rasters.push(source.captureRaster.dataUrl);
  references.forEach((image) => rasters.push(image.dataUrl));
  for (const step of steps) {
    if (step.snapshot.captureRaster) rasters.push(step.snapshot.captureRaster.dataUrl);
    step.context.images.forEach((image) => rasters.push(image.dataUrl));
    if (step.context.editMask) rasters.push(step.context.editMask.image.dataUrl);
    step.variants.forEach((variant) => {
      if (variant) rasters.push(variant.image.dataUrl);
    });
  }
  let bytes = 0;
  for (const raster of rasters) bytes += raster.length;
  if (bytes > MAX_SESSION_ENCODED_BYTES || steps.length > MAX_SESSION_STEPS)
    throw new Error('session-limit');
}

/** Owns one temporary editor conversation. Document/history and API credentials have separate owners. */
export function createImageEditorSession(
  controller: () => ImageApplyController,
  overrides: Partial<Dependencies> = {}
) {
  const deps: Dependencies = {
    capture: captureImageEditorSnapshot,
    mask: createEditorImageMask,
    prepare: prepareImageEditorSnapshot,
    apply: applyImageEditorResult,
    run: runImageEditorJob,
    openDocument: openGeneratedImageDocument,
    ...overrides,
  };
  const listeners = new Set<() => void>();
  const receipts = new Map<string, ImageApplyReceipt>();
  const appliedResults = new Map<string, ImageApplyReceipt>();
  const sessionId = crypto.randomUUID();
  let parameterProfileKey = '';
  let preparedKey = '';
  let attemptedPreparationKey = '';
  let acknowledgedModel = '';
  let state = initialState();
  let active: AbortController | null = null;
  let documentIdentity = controller().originalDocument;
  const publish = (patch: Partial<ImageSessionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const publishJobFailure = (job: AbortController, error: unknown) => {
    if (active !== job) return;
    publish({
      error: job.signal.aborted ? 'cancelled' : failureCode(error),
      diagnostic: error instanceof ImageJobError ? error.diagnostic : null,
    });
  };
  const selectedVariant = (reference = state.selected) => {
    if (!reference) return null;
    return (
      state.steps.find((step) => step.id === reference.stepId)?.variants[reference.variant] ?? null
    );
  };
  const sourcePreparationKey = (
    source: EditorImageSnapshot,
    size: { width: number; height: number } | null,
    base = state.base
  ) =>
    `${source.id}:${base?.stepId ?? 'original'}:${base?.variant ?? 0}:${size?.width ?? 0}x${size?.height ?? 0}`;
  const sourceIsPrepared = (size: { width: number; height: number } | null) =>
    state.draft.intention === 'new-image' ||
    Boolean(state.source && preparedKey === sourcePreparationKey(state.source, size));
  const modelKey = (model: ImageSessionModel) =>
    JSON.stringify([model.modelId, model.providerId, model.modelCode, model.destinationBinding]);
  const modelChoiceRequired = (model: ImageSessionModel) => {
    const basis = state.steps.find((step) => step.id === state.base?.stepId);
    return Boolean(
      basis &&
      modelKey(basis.model) !== modelKey(model) &&
      acknowledgedModel !== `${basis.id}:${modelKey(model)}`
    );
  };
  const preparationVariant = () => {
    const step = state.steps.find((entry) => entry.id === state.base?.stepId);
    const variant = selectedVariant(state.base);
    return step && variant
      ? { image: variant.image, inputBounds: step.snapshot.inputBounds }
      : undefined;
  };
  const capture = (signal: AbortSignal, region?: ImageBounds) =>
    deps.capture(controller(), {
      intention: state.draft.intention,
      context: state.draft.context,
      regionSource: state.draft.regionSource,
      ...(region ? { region } : {}),
      signal,
    });
  const begin = (status: ImageSessionState['status']) => {
    if (active) return null;
    active = new AbortController();
    publish({ status, error: null, diagnostic: null });
    return active;
  };
  const end = (job: AbortController) => {
    if (active === job) {
      active = null;
      publish({ status: 'idle' });
    }
  };
  const stop = () => active?.abort();
  const prepareCapturedSource = async (
    source: EditorImageSnapshot,
    size: { width: number; height: number } | null,
    variant: ReturnType<typeof preparationVariant>,
    key: string,
    job: AbortController
  ) => {
    const prepared = await deps.prepare(source, size, variant, job.signal);
    job.signal.throwIfAborted();
    assertSessionBudget(state.steps, prepared, state.draft.references);
    if (active === job) {
      preparedKey = key;
      publish({ source: prepared });
    }
  };
  const isApplied = (mode: 'add' | 'replace' | 'update') => {
    const choice = state.selected;
    const step = state.steps.find((entry) => entry.id === choice?.stepId);
    if (!choice || !step || controller().originalDocument !== step.snapshot.originalDocument)
      return false;
    const key = `${choice.stepId}:${choice.variant}:`;
    const receipt =
      mode === 'update'
        ? ['add', 'replace', 'update']
            .map((action) => appliedResults.get(key + action))
            .find((entry) => entry && entry === receipts.get(step.operationId))
        : appliedResults.get(key + mode);
    if (!receipt) return false;
    return mode === 'add'
      ? isImageApplyResultPresent(controller(), receipt)
      : canUpdateImageResult(controller(), receipt);
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    sourceIsPrepared,
    modelChoiceRequired,
    isApplied,
    acknowledgeModel(model: ImageSessionModel) {
      acknowledgedModel = `${state.base?.stepId ?? ''}:${modelKey(model)}`;
      publish({ error: null });
    },
    async prepareSource(size: { width: number; height: number } | null) {
      const source = state.source;
      if (!source || source.intention === 'new-image') return;
      const key = sourcePreparationKey(source, size);
      if (attemptedPreparationKey === key) return;
      const job = begin('preparing');
      if (!job) return;
      attemptedPreparationKey = key;
      try {
        await prepareCapturedSource(source, size, preparationVariant(), key, job);
      } catch (error) {
        publishJobFailure(job, error);
      } finally {
        end(job);
      }
    },

    getSelectedVariant: () => selectedVariant(),
    canUpdate() {
      const receipt = receipts.get(state.operationId);
      return Boolean(receipt && canUpdateImageResult(controller(), receipt));
    },
    configureParameters(key: string, defaults: ImageParameters) {
      if (active || key === parameterProfileKey) return;
      const parameters = { ...defaults, ...state.draft.parameters };
      parameterProfileKey = key;
      publish({ draft: { ...state.draft, parameters } });
    },
    setDraft(patch: Partial<ImageSessionState['draft']>) {
      if (active && Object.keys(patch).some((key) => key !== 'prompt')) return;
      if (patch.references) patch.references.forEach((image) => imageRasterSchema.parse(image));
      const sourceChanged =
        patch.intention !== undefined ||
        patch.context !== undefined ||
        patch.regionSource !== undefined;
      publish({
        draft: { ...state.draft, ...patch },
        ...(sourceChanged
          ? { source: null, base: null, selected: null, operationId: crypto.randomUUID() }
          : {}),
        error: null,
      });
    },
    stop,
    resetDocument() {
      const current = controller().originalDocument;
      if (current === documentIdentity) return;
      documentIdentity = current;
      const parameters = state.draft.parameters;
      stop();
      active = null;
      receipts.clear();
      appliedResults.clear();
      state = initialState();
      state.draft.parameters = parameters;
      publish({});
    },
    clear() {
      const draft = state.draft;
      stop();
      active = null;
      receipts.clear();
      appliedResults.clear();
      state = { ...initialState(), draft: { ...draft, prompt: '', references: [] } };
      publish({});
    },
    newTask() {
      if (active) return;
      publish({
        source: null,
        selected: null,
        base: null,
        operationId: crypto.randomUUID(),
        error: null,
        draft: { ...state.draft, prompt: '', references: [] },
      });
    },
    chooseVariant(stepId: string, variant: number) {
      if (active) return;
      const step = state.steps.find((entry) => entry.id === stepId);
      if (!step?.variants[variant]) return;
      publish({
        selected: { stepId, variant },
        base: { stepId, variant },
        source: step.snapshot,
        operationId: step.operationId,
        draft: {
          ...state.draft,
          intention: step.snapshot.intention,
          context: step.snapshot.contextMode,
          regionSource: step.snapshot.regionSource,
        },
        error: null,
      });
    },
    useOriginal() {
      if (!active) publish({ base: null });
    },
    async refreshSource(
      region?: ImageBounds,
      size: { width: number; height: number } | null = null
    ) {
      const job = begin('preparing');
      if (!job) return;
      try {
        const source = await capture(job.signal, region);
        job.signal.throwIfAborted();
        if (active !== job) return;
        publish({ source, selected: null, base: null, operationId: crypto.randomUUID() });
        const key = sourcePreparationKey(source, size, null);
        attemptedPreparationKey = key;
        await prepareCapturedSource(source, size, undefined, key, job);
      } catch (error) {
        publishJobFailure(job, error);
      } finally {
        end(job);
      }
    },
    async generate(
      model: ImageSessionModel,
      region?: ImageBounds,
      size: { width: number; height: number } | null = null,
      minimumInputSide = 1,
      profile?: ImageModelProfile
    ) {
      const job = begin('preparing');
      if (!job) return;
      const draft = {
        ...state.draft,
        parameters: { ...state.draft.parameters },
        references: [...state.draft.references],
      };
      try {
        if (modelChoiceRequired(model)) throw new Error('model-choice-required');
        if (!sourceIsPrepared(size)) throw new Error('source-not-prepared');
        if (
          state.steps.filter((step) => step.operationId === state.operationId).length >=
          MAX_STEPS_PER_OPERATION
        )
          throw new Error('session-limit');
        const source = state.source ?? (await capture(job.signal, region));
        job.signal.throwIfAborted();
        if (active !== job) return;
        let base =
          source.intention === 'new-image'
            ? (selectedVariant(state.base)?.image ?? null)
            : source.raster;
        if (base && source.intention === 'new-image')
          base = await prepareImageReference(base, minimumInputSide, job.signal);
        const references: ImageRaster[] = [];
        for (const reference of draft.references) {
          job.signal.throwIfAborted();
          references.push(await prepareImageReference(reference, minimumInputSide, job.signal));
        }
        job.signal.throwIfAborted();
        if (active !== job) return;
        const currentDocument = controller();
        if (
          currentDocument.canvas !== source.canvas ||
          currentDocument.originalDocument !== source.originalDocument
        )
          throw new Error('stale-document');
        const local = source.intention === 'region' || source.intention === 'layers';
        const mask =
          local && base
            ? deps.mask(
                base,
                imageRasterRegion(source.inputBounds, source.targetBounds, base),
                profile?.editMask ?? 'reference'
              )
            : undefined;
        const context = buildImageContext(
          source,
          {
            ...draft,
            references,
            parameters:
              local && profile
                ? getImageEditParameters(profile, source.inputBounds, draft.parameters)
                : draft.parameters,
          },
          base,
          mask
        );
        const requestId = crypto.randomUUID();
        const step: ImageSessionStep = {
          id: requestId,
          startedAt: performance.now(),
          operationId: state.operationId,
          snapshot: source,
          context,
          modelLabel: model.label,
          model: { ...model },
          variants: [],
          applied: false,
        };
        assertSessionBudget([...state.steps, step], state.source, state.draft.references);
        publish({ source, status: 'generating', steps: [...state.steps, step] });
        await deps.run({
          signal: job.signal,
          request: {
            type: 'start',
            requestId,
            modelId: model.modelId,
            approvedModelCode: model.modelCode,
            approvedProviderId: model.providerId,
            approvedDestination: model.destinationBinding,
            scope: { documentId: source.sourceId, sessionId, snapshotId: source.id },
            context,
          },
          receive(message) {
            if (active !== job || job.signal.aborted || message.type !== 'image') return;
            const steps = state.steps.map((entry) => {
              if (entry.id !== requestId) return entry;
              const variants = [...entry.variants];
              variants[message.variant] = {
                image: message.image,
                durationMs: Math.max(0, performance.now() - step.startedAt),
                ...(message.costRub !== undefined ? { costRub: message.costRub } : {}),
              };
              return { ...entry, variants };
            });
            assertSessionBudget(steps, state.source, state.draft.references);
            publish({
              steps,
              selected: { stepId: requestId, variant: message.variant },
              base: { stepId: requestId, variant: message.variant },
            });
          },
        });
        job.signal.throwIfAborted();
        if (active === job && state.draft.prompt === draft.prompt)
          publish({ draft: { ...state.draft, prompt: '' } });
      } catch (error) {
        publishJobFailure(job, error);
      } finally {
        end(job);
      }
    },
    async openDocument(title: string) {
      const variant = selectedVariant();
      if (!variant) return;
      const job = begin('opening');
      if (!job) return;
      try {
        await deps.openDocument(variant.image, title);
      } catch {
        if (active === job) publish({ error: 'open-document-failed' });
      } finally {
        end(job);
      }
    },
    async apply(
      mode: 'add' | 'replace' | 'update',
      fit: boolean,
      name: string,
      fitting: ImageResultFitting = 'exact'
    ) {
      const choice = state.selected;
      const step = state.steps.find((entry) => entry.id === choice?.stepId);
      const variant = selectedVariant();
      if (!step || !variant) return;
      if (isApplied(mode)) return;
      const job = begin('applying');
      if (!job) return;
      try {
        const previous = receipts.get(step.operationId);
        const receipt = await deps.apply({
          controller,
          snapshot: step.snapshot,
          raster: variant.image,
          mode,
          fit,
          fitting,
          name,
          ...(previous ? { previous } : {}),
          signal: job.signal,
        });
        if (active !== job) return;
        receipts.set(step.operationId, receipt);
        appliedResults.set(`${step.id}:${choice!.variant}:${mode}`, receipt);
        publish({
          steps: state.steps.map((entry) =>
            entry.id === step.id ? { ...entry, applied: true } : entry
          ),
        });
      } catch (error) {
        publishJobFailure(job, error);
      } finally {
        end(job);
      }
    },
  };
}
export type ImageEditorSession = ReturnType<typeof createImageEditorSession>;
