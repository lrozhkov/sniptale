import sparkleIcon from '@iconify-icons/tabler/sparkle-2';
import { Icon } from '@iconify/react';
import { getAIProviderFailureKey } from '../../features/ai/provider-failure-copy';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, History, MessageSquarePlus, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ImagePrompt } from './prompt';
import { translate, useAppLocale, type TranslationKey } from '../../platform/i18n';
import { AIModelSelector } from '../../features/ai/model-selector';
import { useEditorController } from '../application/controller-context';
import { useEditorStore } from '../state/useEditorStore';
import { EditorIconButton } from '../chrome/ui';
import { ImageRegionPicker } from './region-picker';
import type { ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';
import { ImageParametersEditor, resolveImageParameterChoices } from './parameters';
import { getImageEditParameters, resolveImageModelProfile } from '../../contracts/ai/image-profile';
import { ImageAttachments } from './attachments';
import { ImageGenerationDetails } from './generation-details';
import { ImageSessionHistory } from './session-history';
import { ImageSourceControls } from './source';
import { useImageModelSelection } from './model-selection';
import { ImagePreviewWorkspace } from './preview';
import {
  INSPECTOR_INLINE_BUTTON_CLASS_NAME,
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
} from '../inspector/chrome';

const errorMessages: Readonly<Record<string, TranslationKey>> = {
  unauthorized: 'editor.ai.approvalFailed',
  'provider-failed': 'editor.ai.providerFailed',
  'invalid-request': 'editor.ai.requestRejected',
  stale: 'editor.ai.configurationChanged',
  'catalog-unavailable': 'editor.ai.noModel',
  'selection-write-failed': 'editor.ai.selectionFailed',
  'session-limit': 'editor.ai.limit',
  'output-too-small': 'editor.ai.outputTooSmall',
  'source-not-prepared': 'editor.ai.prepareSource',
  'model-choice-required': 'editor.ai.confirmModel',
  'open-document-failed': 'editor.ai.openDocumentFailed',
  'choose-region': 'editor.ai.chooseRegionHint',
  'invalid-region': 'editor.ai.chooseRegionHint',
  'transparent-region': 'editor.ai.transparentRegion',
  'size-mismatch': 'editor.ai.sizeMismatch',
  'unsupported-selection': 'editor.ai.unsupportedSelection',
  'source-unavailable': 'editor.ai.sourceMissing',
  cancelled: 'editor.ai.stopped',
  'invalid-response': 'editor.ai.invalidResponse',
  'too-large': 'editor.ai.imageTooLarge',
  'secret-unavailable': 'editor.ai.secretUnavailable',
  'permission-denied': 'editor.ai.permissionDenied',
  'network-failed': 'editor.ai.interrupted',
  timeout: 'editor.ai.interrupted',
  interrupted: 'editor.ai.interrupted',
  'stale-document': 'editor.ai.documentChanged',
  'stale-source': 'editor.ai.stale',
  'changed-result': 'editor.ai.resultChanged',
  'model-unavailable': 'editor.ai.modelUnsupported',
};

/** Compact assistant content for the existing right inspector. Its parent owns session lifetime. */
export function ImageAIInspector({ session }: { session: ImageEditorSession }) {
  useAppLocale();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const controller = useEditorController();
  const [region, setRegion] = useState<ImageBounds | null>(() =>
    state.source?.intention === 'region' ? state.source.targetBounds : null
  );
  const [pickingRegion, setPickingRegion] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const sourceSelectionKey = useEditorStore(
    (store) => `${store.selection.selectedObjectIds.join(',')}:${store.history.index}`
  );
  const selectedCount = useEditorStore((store) => store.selection.selectedObjectCount);
  const activeTool = useEditorStore((store) => store.activeTool);
  useEffect(() => {
    if (activeTool !== 'select') setPickingRegion(false);
  }, [activeTool]);
  const { selection, model, profile, inputSize, editing, modelChoiceRequired } =
    useImageModelSelection(session, state, { region, key: sourceSelectionKey, selectedCount });
  const [preparationError, setPreparationError] = useState<string | null>(null),
    [uploading, setUploading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const busy = state.status !== 'idle' || selection.selectionPending;
  const localEdit = state.draft.intention === 'region' || state.draft.intention === 'layers';
  const effectiveParameters =
    localEdit && profile && inputSize
      ? getImageEditParameters(profile, inputSize, state.draft.parameters)
      : state.draft.parameters;
  const incompatibleParameters = profile
    ? resolveImageParameterChoices(profile, effectiveParameters).incompatible.length > 0
    : false;
  const tooManyInputs =
    profile !== null &&
    state.draft.references.length +
      ((editing && state.draft.intention !== 'new-image') || state.base ? 1 : 0) +
      (localEdit && profile?.editMask !== 'alpha' ? 1 : 0) >
      profile.maxInputImages;
  const baseImage = state.base
    ? state.steps.find((step) => step.id === state.base?.stepId)?.variants[state.base.variant]
        ?.image
    : null;
  const beginRegionSelection = () => {
    setRegion(null);
    session.setDraft({
      intention: 'region',
      context: state.draft.context === 'whole' ? 'whole' : 'surroundings',
      regionSource: 'canvas',
    });
    controller.setActiveTool('select');
    useEditorStore.getState().syncActiveTool('select');
    setPickingRegion(true);
  };
  const beginLayerSelection = (reset = false) => {
    setPickingRegion(false);
    if (reset) controller.clearSelection();
    controller.setActiveTool('select');
    useEditorStore.getState().syncActiveTool('select');
    session.setDraft({
      intention: 'layers',
      context: state.draft.context === 'whole' ? 'whole' : 'surroundings',
      regionSource: 'canvas',
    });
  };
  const newTask = () => {
    const intention = session.getSnapshot().draft.intention;
    session.newTask();
    setPreparationError(null);
    setHistoryOpen(false);
    if (intention === 'region') beginRegionSelection();
    else if (intention === 'layers') beginLayerSelection(true);
    else {
      setPickingRegion(false);
      setRegion(null);
    }
  };
  const needsRegion =
    state.draft.intention === 'region' && !region && !state.source?.raster && !baseImage;
  const needsLayers =
    state.draft.intention === 'layers' && !selectedCount && !state.source?.raster && !baseImage;
  const generate = async () => {
    const attempt = new AbortController();
    pending.current = attempt;
    setPreparationError(null);
    try {
      const prepared = await selection.prepareModelSelection(attempt.signal);
      const selectedModel = prepared.catalog.models.find((entry) => entry.id === prepared.modelId);
      const selectedProvider = prepared.catalog.providers.find(
        (entry) => entry.id === selectedModel?.providerId
      );
      if (!selectedModel || !selectedProvider?.destinationBinding)
        throw new Error('model-unavailable');
      await session.generate(
        {
          modelId: selectedModel.id,
          modelCode: selectedModel.modelCode,
          providerId: selectedProvider.id,
          destinationBinding: selectedProvider.destinationBinding,
          label: `${selectedProvider.name} / ${selectedModel.displayName}`,
        },
        region ?? undefined,
        inputSize,
        profile?.minInputSide,
        profile ?? undefined
      );
    } catch (error) {
      if (!attempt.signal.aborted)
        setPreparationError(
          error instanceof Error &&
            ['catalog-unavailable', 'model-unavailable', 'selection-write-failed'].includes(
              error.message
            )
            ? error.message
            : 'invalid-request'
        );
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
  };
  const failure = preparationError ?? state.error;
  const error = translate(
    (!preparationError && getAIProviderFailureKey(state.diagnostic?.reason)) ||
      (failure && errorMessages[failure]) ||
      'editor.ai.error'
  );
  return (
    <ImagePreviewWorkspace
      session={session}
      state={state}
      onFinish={newTask}
      hidden={pickingRegion || historyOpen}
    >
      {pickingRegion ? (
        <ImageRegionPicker
          controller={controller.getPublicApiAdapter()}
          onCancel={() => setPickingRegion(false)}
          onSelect={(bounds) => {
            setPickingRegion(false);
            setRegion(bounds);
          }}
        />
      ) : null}
      <div
        className={[
          'sniptale-inspector-surface editor-inspector-surface space-y-3',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        data-ui="editor.ai.inspector"
      >
        {historyOpen ? (
          <ImageSessionHistory
            session={session}
            state={state}
            busy={busy}
            onBack={() => {
              setHistoryOpen(false);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>('[data-ui="editor.ai.history.open"]')
                  ?.focus()
              );
            }}
          />
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1">
              <EditorIconButton
                title={translate('editor.ai.newTask')}
                data-ui="editor.ai.new-task"
                className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-text-primary-strong)]"
                disabled={busy || uploading}
                onClick={newTask}
              >
                <MessageSquarePlus size={16} />
              </EditorIconButton>
              <div className="min-w-0 flex-1">
                <AIModelSelector
                  portalMenu
                  models={selection.configuration?.models ?? []}
                  providers={selection.configuration?.providers ?? []}
                  selectedModelId={selection.modelId}
                  onSelect={(id) => {
                    setPickingRegion(false);
                    selection.chooseModel(id);
                    const selected = selection.configuration?.models.find(
                      (entry) => entry.id === id
                    );
                    const destination = selection.configuration?.providers.find(
                      (entry) => entry.id === selected?.providerId
                    );
                    if (selected && destination?.destinationBinding) {
                      const nextProfile = resolveImageModelProfile(
                        selected,
                        destination,
                        editing ? 'image-editing' : 'image-generation'
                      );
                      if (nextProfile)
                        session.setDraft({
                          parameters: resolveImageParameterChoices(
                            nextProfile,
                            state.draft.parameters
                          ).parameters,
                        });
                      session.acknowledgeModel({
                        modelId: selected.id,
                        modelCode: selected.modelCode,
                        providerId: destination.id,
                        destinationBinding: destination.destinationBinding,
                        label: `${destination.name} / ${selected.displayName}`,
                      });
                    }
                  }}
                  disabled={busy}
                />
              </div>
              <ImageGenerationDetails
                step={
                  state.steps.find((entry) => entry.id === state.selected?.stepId) ??
                  state.steps.at(-1)
                }
                variant={state.selected?.variant}
              />
              <EditorIconButton
                title={translate('editor.ai.history')}
                data-ui="editor.ai.history.open"
                className="!border-transparent !bg-transparent hover:!text-[var(--sniptale-color-text-primary-strong)]"
                disabled={busy || uploading}
                onClick={() => {
                  setPickingRegion(false);
                  setHistoryOpen(true);
                }}
              >
                <History size={16} />
              </EditorIconButton>
            </div>
            {selection.configurationFailed || selection.selectionUnavailable || !model ? (
              <div className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
                <span>{translate('editor.ai.noModel')}</span>
                <EditorIconButton
                  title={translate('editor.ai.retryModels')}
                  onClick={() => void selection.retryConfiguration()}
                >
                  <RefreshCw size={14} />
                </EditorIconButton>
              </div>
            ) : null}
            <ImageSourceControls
              session={session}
              state={state}
              region={region}
              selectedCount={selectedCount}
              pickingRegion={pickingRegion}
              busy={busy}
              onCancelRegion={() => setPickingRegion(false)}
              onSelectRegion={beginRegionSelection}
              onSelectLayers={() => beginLayerSelection()}
            />
            {localEdit ? (
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label={translate('editor.ai.editContext')}
                data-ui="editor.ai.edit-context"
              >
                {(['surroundings', 'whole'] as const).map((context) => (
                  <ProductActionButton
                    key={context}
                    compact
                    tone="toggle"
                    active={state.draft.context === context}
                    aria-pressed={state.draft.context === context}
                    disabled={busy}
                    className="!h-8 !min-h-8 !rounded-[4px] !px-2 !text-xs"
                    onClick={() => session.setDraft({ context })}
                  >
                    {translate(
                      context === 'whole'
                        ? 'editor.ai.contextWholeMask'
                        : 'editor.ai.contextSurroundings'
                    )}
                  </ProductActionButton>
                ))}
              </div>
            ) : null}
            <ImagePrompt
              operationId={state.operationId}
              value={state.draft.prompt}
              refining={Boolean(state.base)}
              voiceDisabled={busy}
              onChange={(prompt) => {
                session.setDraft({ prompt });
                setPreparationError(null);
              }}
            />

            <ImageAttachments
              source={
                localEdit
                  ? (state.source?.raster ?? null)
                  : (baseImage ?? state.source?.raster ?? null)
              }
              sourceFromResult={Boolean(baseImage)}
              onRemoveSource={() => {
                if (state.draft.intention === 'layers') {
                  beginLayerSelection(true);
                  return;
                }
                if (state.draft.intention === 'region') {
                  beginRegionSelection();
                  return;
                }
                setPickingRegion(false);
                session.setDraft({
                  intention: 'new-image',
                  context: 'region',
                  regionSource: 'canvas',
                });
              }}
              controls={
                <EditorIconButton
                  title={`${translate('editor.ai.variantsHint')}: ${state.draft.parameters.variants}`}
                  data-ui="editor.ai.variant-count"
                  className={[
                    '!h-8 !w-8 !border-transparent !bg-transparent',
                    'hover:!text-[var(--sniptale-color-text-primary-strong)]',
                  ].join(' ')}
                  disabled={busy}
                  onClick={() =>
                    session.setDraft({
                      parameters: {
                        ...state.draft.parameters,
                        variants: (state.draft.parameters.variants % 3) + 1,
                      },
                    })
                  }
                >
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <Copy size={20} />
                    <span
                      className={[
                        'absolute -bottom-1 -right-1 min-w-3 rounded-[2px]',
                        'bg-[var(--sniptale-color-surface-panel)] text-center text-[10px] leading-3 tabular-nums',
                      ].join(' ')}
                    >
                      {state.draft.parameters.variants}
                    </span>
                  </span>
                </EditorIconButton>
              }
              operationId={state.operationId}
              images={state.draft.references}
              disabled={busy}
              onPendingChange={setUploading}
              onChange={(references) => session.setDraft({ references })}
            />
            {state.base ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {translate('editor.ai.base')} · {state.base.variant + 1}
                </span>
                <ProductActionButton
                  compact
                  tone="secondary"
                  className={INSPECTOR_INLINE_BUTTON_CLASS_NAME}
                  disabled={busy}
                  onClick={() => session.useOriginal()}
                >
                  {translate('editor.ai.useOriginal')}
                </ProductActionButton>
              </div>
            ) : null}

            <ImageParametersEditor
              profile={profile}
              value={effectiveParameters}
              disabled={busy}
              automaticGeometry={localEdit}
              onChange={(parameters) =>
                session.setDraft({
                  parameters: localEdit
                    ? {
                        ...parameters,
                        aspectRatio: state.draft.parameters.aspectRatio,
                        size: state.draft.parameters.size,
                      }
                    : parameters,
                })
              }
            />
            {modelChoiceRequired ? (
              <p className="text-xs text-[var(--sniptale-color-danger)]">
                {translate('editor.ai.confirmModel')}
              </p>
            ) : null}
            {tooManyInputs || (model && !profile) ? (
              <p className="text-xs text-[var(--sniptale-color-danger)]">
                {translate('editor.ai.modelUnsupported')}
              </p>
            ) : null}
            {needsRegion ? (
              <p
                className="text-xs text-[var(--sniptale-color-danger)]"
                role="status"
                data-ui="editor.ai.region-required"
              >
                {translate('editor.ai.selectRegion')}
              </p>
            ) : null}
            {needsLayers ? (
              <p
                className="text-xs text-[var(--sniptale-color-danger)]"
                role="status"
                data-ui="editor.ai.layers-required"
              >
                {translate('editor.ai.selectLayersHint')}
              </p>
            ) : null}
            <ImageRequestControls
              busy={busy}
              status={state.status}
              generationStartedAt={state.steps.at(-1)?.startedAt ?? null}
              error={failure ? error : null}
              diagnostic={preparationError ? null : state.diagnostic}
              disabled={
                pickingRegion ||
                !profile ||
                incompatibleParameters ||
                modelChoiceRequired ||
                !session.sourceIsPrepared(inputSize) ||
                tooManyInputs ||
                uploading ||
                !state.draft.prompt.trim() ||
                (state.draft.intention !== 'new-image' && !state.source)
              }
              onGenerate={() => void generate()}
              onStop={() => {
                pending.current?.abort();
                session.stop();
              }}
            />
          </>
        )}
      </div>
    </ImagePreviewWorkspace>
  );
}

function ImageRequestControls(props: {
  busy: boolean;
  status: ImageSessionState['status'];
  generationStartedAt: number | null;
  error: string | null;
  diagnostic: ImageSessionState['diagnostic'];
  disabled: boolean;
  onGenerate(): void;
  onStop(): void;
}) {
  const statusKey =
    props.status === 'opening'
      ? 'editor.ai.openingDocument'
      : props.status === 'applying'
        ? 'editor.ai.applying'
        : props.status === 'generating'
          ? 'editor.ai.generating'
          : 'editor.ai.preparing';
  return (
    <>
      {props.error ? (
        <div role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {props.error}
          {props.diagnostic ? (
            <details className="mt-1 text-[var(--sniptale-color-text-secondary)]">
              <summary>{translate('editor.ai.diagnostics')}</summary>
              {props.diagnostic.phase} ·{' '}
              {props.diagnostic.approvalReason ?? props.diagnostic.reason ?? props.diagnostic.code}
            </details>
          ) : null}
        </div>
      ) : null}
      <div
        className="relative h-8 w-full"
        data-ui="editor.ai.request-action"
        aria-busy={props.busy}
      >
        <ProductActionButton
          compact
          className={[
            INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
            '!h-8 !min-h-8 !px-3 [&>.sniptale-command-content]:w-full',
            props.busy ? 'disabled:!opacity-100' : '',
          ].join(' ')}
          disabled={props.busy || props.disabled}
          onClick={props.onGenerate}
          data-ui="editor.ai.generate"
        >
          <span className="grid w-full grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-2 text-left">
            <span className="w-[5ch] text-left tabular-nums">
              {props.status === 'generating' && props.generationStartedAt !== null ? (
                <ImageGenerationElapsed startedAt={props.generationStartedAt} />
              ) : null}
            </span>
            <span
              className="flex min-w-0 items-center justify-center gap-2"
              data-ui="editor.ai.request-caption"
            >
              {props.busy ? (
                <LoaderCircle
                  size={16}
                  aria-hidden="true"
                  data-ui="editor.ai.request-spinner"
                  className="shrink-0 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Icon
                  ssr
                  aria-hidden="true"
                  icon={sparkleIcon}
                  width={16}
                  height={16}
                  className="shrink-0"
                />
              )}
              <span
                className="truncate"
                data-ui="editor.ai.request-label"
                role={props.busy ? 'status' : undefined}
              >
                {translate(
                  props.busy
                    ? props.status === 'generating'
                      ? 'editor.ai.waiting'
                      : statusKey
                    : 'editor.ai.send'
                )}
              </span>
            </span>
            <span aria-hidden="true" />
          </span>
        </ProductActionButton>
        {props.busy ? (
          <EditorIconButton
            title={translate('editor.ai.stop')}
            data-ui="editor.ai.request-cancel"
            className={[
              'absolute right-1 top-0 !h-8 !w-8 !border-transparent !bg-transparent',
              'hover:!text-[var(--sniptale-color-text-primary-strong)]',
            ].join(' ')}
            disabled={props.status === 'opening'}
            onClick={props.onStop}
          >
            <X size={14} />
          </EditorIconButton>
        ) : null}
      </div>
    </>
  );
}

/** Uses the session's monotonic start time so returning to this inspector retains elapsed time. */
function ImageGenerationElapsed({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.floor((performance.now() - startedAt) / 1000))
  );
  useEffect(() => {
    const update = () =>
      setSeconds(Math.max(0, Math.floor((performance.now() - startedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [startedAt]);
  return (
    <time
      dateTime={`PT${seconds}S`}
      aria-label={translate('editor.ai.elapsed')}
      aria-live="off"
      className="tabular-nums text-[var(--sniptale-color-text-secondary)]"
      data-ui="editor.ai.generation-elapsed"
    >
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </time>
  );
}
