import { getAIProviderFailureKey } from '../../features/ai/provider-failure-copy';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { translate, useAppLocale, type TranslationKey } from '../../platform/i18n';
import { AIModelSelector } from '../../features/ai/model-selector';
import { useEditorController } from '../application/controller-context';
import { useEditorStore } from '../state/useEditorStore';
import { EditorIconButton } from '../chrome/ui';
import { ImageRegionPicker } from './region-picker';
import type { ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';
import { ImageParametersEditor, resolveImageParameterChoices } from './parameters';
import { ImageAttachments } from './attachments';
import { ImageResults } from './results';
import { ImageSessionMenu } from './session-menu';
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
  const sourceSelectionKey = useEditorStore(
    (store) => `${store.selection.selectedObjectIds.join(',')}:${store.history.index}`
  );
  const selectedCount = useEditorStore((store) => store.selection.selectedObjectCount);
  const { selection, model, profile, inputSize, editing, modelChoiceRequired } =
    useImageModelSelection(session, state, { region, key: sourceSelectionKey });
  const [preparationError, setPreparationError] = useState<string | null>(null),
    [uploading, setUploading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const busy = state.status !== 'idle' || selection.selectionPending;
  const incompatibleParameters = profile
    ? resolveImageParameterChoices(profile, state.draft.parameters).incompatible.length > 0
    : false;
  const tooManyInputs =
    profile !== null &&
    state.draft.references.length +
      ((editing && state.draft.intention !== 'new-image') || state.base ? 1 : 0) >
      profile.maxInputImages;
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
        profile?.minInputSide
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
    <ImagePreviewWorkspace session={session} state={state} hidden={pickingRegion}>
      {pickingRegion ? (
        <ImageRegionPicker
          controller={controller.getPublicApiAdapter()}
          onCancel={() => setPickingRegion(false)}
          onSelect={(bounds) => {
            setPickingRegion(false);
            setRegion(bounds);
            session.setDraft({ intention: 'region', regionSource: 'canvas' });
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
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <AIModelSelector
              portalMenu
              models={selection.configuration?.models ?? []}
              providers={selection.configuration?.providers ?? []}
              selectedModelId={selection.modelId}
              onSelect={(id) => {
                selection.chooseModel(id);
                const selected = selection.configuration?.models.find((entry) => entry.id === id);
                const destination = selection.configuration?.providers.find(
                  (entry) => entry.id === selected?.providerId
                );
                if (selected && destination?.destinationBinding)
                  session.acknowledgeModel({
                    modelId: selected.id,
                    modelCode: selected.modelCode,
                    providerId: destination.id,
                    destinationBinding: destination.destinationBinding,
                    label: `${destination.name} / ${selected.displayName}`,
                  });
              }}
              disabled={busy}
            />
          </div>
          <ImageSessionMenu session={session} disabled={busy} />
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
          busy={busy || pickingRegion}
          onSelectRegion={() => {
            controller.setActiveTool('select');
            setPickingRegion(true);
          }}
        />
        <ImageResults
          key={`${state.selected?.stepId}:${state.selected?.variant}`}
          session={session}
          state={state}
          controller={controller.getPublicApiAdapter()}
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
        <ProductTextarea
          rows={3}
          maxLength={4000}
          value={state.draft.prompt}
          aria-label={translate('editor.ai.prompt')}
          placeholder={translate(state.base ? 'editor.ai.refine' : 'editor.ai.prompt')}
          onChange={(event) => {
            session.setDraft({ prompt: event.currentTarget.value });
            setPreparationError(null);
          }}
          className="w-full resize-y"
          data-ui="editor.ai.prompt"
        />
        <ImageAttachments
          operationId={state.operationId}
          images={state.draft.references}
          disabled={busy}
          onPendingChange={setUploading}
          onChange={(references) => session.setDraft({ references })}
        />
        <ImageParametersEditor
          profile={profile}
          value={state.draft.parameters}
          disabled={busy}
          onChange={(parameters) => session.setDraft({ parameters })}
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
        <ImageRequestControls
          busy={busy}
          status={state.status}
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
        <p className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.privacy')}
        </p>
        {state.steps.length ? (
          <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
            {state.steps.map((step) => (
              <details key={step.id} className="text-xs">
                <summary className="cursor-pointer break-words">
                  <span>{step.context.prompt}</span>
                  <span className="ml-2 text-[var(--sniptale-color-text-secondary)]">
                    {step.variants.filter(Boolean).length}
                    {step.applied ? ` · ${translate('editor.ai.applied')}` : ''}
                  </span>
                </summary>
                <p className="my-1 break-words text-[var(--sniptale-color-text-secondary)]">
                  {step.modelLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {step.variants.map((variant, i) =>
                    variant ? (
                      <ProductActionButton
                        key={i}
                        type="button"
                        compact
                        tone="toggle"
                        active={state.selected?.stepId === step.id && state.selected.variant === i}
                        aria-pressed={
                          state.selected?.stepId === step.id && state.selected.variant === i
                        }
                        className="!h-auto !p-1"
                        disabled={busy}
                        aria-label={`${translate('editor.ai.variants')} ${i + 1}`}
                        onClick={() => session.chooseVariant(step.id, i)}
                      >
                        <img
                          src={variant.image.dataUrl}
                          alt=""
                          className="h-12 w-16 rounded-[4px] object-contain"
                        />
                      </ProductActionButton>
                    ) : null
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </ImagePreviewWorkspace>
  );
}

function ImageRequestControls(props: {
  busy: boolean;
  status: ImageSessionState['status'];
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
      {props.busy ? (
        <div className="flex items-center justify-between gap-2">
          <span role="status" className="text-xs">
            {translate(statusKey)}
          </span>
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_INLINE_BUTTON_CLASS_NAME}
            disabled={props.status === 'opening'}
            onClick={props.onStop}
          >
            {translate('editor.ai.stop')}
          </ProductActionButton>
        </div>
      ) : (
        <ProductActionButton
          compact
          className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
          disabled={props.disabled}
          onClick={props.onGenerate}
          data-ui="editor.ai.generate"
        >
          {translate('editor.ai.generate')}
        </ProductActionButton>
      )}
    </>
  );
}
