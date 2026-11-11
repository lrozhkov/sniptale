import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { translate, useAppLocale, type TranslationKey } from '../../platform/i18n';
import { AIModelSelector } from '../../features/ai/model-selector';
import { useEditorController } from '../application/controller-context';
import { useEditorStore } from '../state/useEditorStore';
import { EditorIconButton } from '../chrome/ui';
import type { ImageEditorSession } from './session';
import { ImageParametersEditor, resolveImageParameterChoices } from './parameters';
import { ImageAttachments } from './attachments';
import { ImageResults } from './results';
import { ImageSessionMenu } from './session-menu';
import { ImageSourceControls } from './source';
import { useImageModelSelection } from './model-selection';

const errorMessages: Readonly<Record<string, TranslationKey>> = {
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
  const inspectorRef = useRef<HTMLDivElement>(null);
  const lastResult = useRef(state.selected?.stepId ?? null);
  useEffect(() => {
    if (
      state.status !== 'idle' ||
      !state.selected ||
      lastResult.current === state.selected.stepId ||
      document.activeElement instanceof HTMLTextAreaElement
    )
      return;
    lastResult.current = state.selected.stepId;
    inspectorRef.current
      ?.querySelector<HTMLElement>('[data-ui="editor.ai.result"]')
      ?.scrollIntoView({ block: 'start' });
  }, [state.status, state.selected]);
  const controller = useEditorController();
  const region = useEditorStore((store) => store.cropSelection);
  const selectedCount = useEditorStore((store) => store.selection.selectedObjectCount);
  const { selection, model, profile, outputSize, editing, modelChoiceRequired } =
    useImageModelSelection(session, state);
  const [preparationError, setPreparationError] = useState(false),
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
    setPreparationError(false);
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
        outputSize
      );
    } catch {
      if (!attempt.signal.aborted) setPreparationError(true);
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
  };
  const error = translate((state.error && errorMessages[state.error]) || 'editor.ai.error');
  return (
    <div
      className={[
        'sniptale-inspector-surface editor-inspector-surface space-y-3',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      ref={inspectorRef}
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
        busy={busy}
        outputSize={outputSize}
        onSelectRegion={() => {
          controller.setActiveTool('crop');
          useEditorStore.getState().setActiveTool('crop');
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
          setPreparationError(false);
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
      {state.error || preparationError ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {error}
        </p>
      ) : null}
      {busy ? (
        <div className="flex items-center justify-between gap-2">
          <span role="status" className="text-xs">
            {translate(
              state.status === 'opening'
                ? 'editor.ai.openingDocument'
                : state.status === 'applying'
                  ? 'editor.ai.applying'
                  : state.status === 'generating'
                    ? 'editor.ai.generating'
                    : 'editor.ai.preparing'
            )}
          </span>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={state.status === 'opening'}
            onClick={() => {
              pending.current?.abort();
              session.stop();
            }}
          >
            {translate('editor.ai.stop')}
          </ProductActionButton>
        </div>
      ) : (
        <ProductActionButton
          compact
          className="w-full"
          disabled={
            !profile ||
            incompatibleParameters ||
            modelChoiceRequired ||
            !session.sourceIsPrepared(outputSize) ||
            tooManyInputs ||
            uploading ||
            !state.draft.prompt.trim() ||
            (state.draft.intention !== 'new-image' && !state.source)
          }
          onClick={() => void generate()}
          data-ui="editor.ai.generate"
        >
          {translate('editor.ai.generate')}
        </ProductActionButton>
      )}
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
                    <button
                      key={i}
                      type="button"
                      disabled={busy}
                      aria-label={`${translate('editor.ai.variants')} ${i + 1}`}
                      onClick={() => session.chooseVariant(step.id, i)}
                    >
                      <img
                        src={variant.image.dataUrl}
                        alt=""
                        className="h-12 w-16 rounded-[4px] object-contain"
                      />
                    </button>
                  ) : null
                )}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
