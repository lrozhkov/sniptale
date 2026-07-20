import { Sparkles, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { createScenarioAiDisclosureSummary } from './disclosure/summary';
import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { AIModelSelector } from '../../../features/ai/model-selector';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { ScenarioAiDisclosurePanel } from './disclosure-panel';
import { summarizeScenarioAiOperation } from './deck-submit-action';
import type { ScenarioEditorDeckAiState } from './deck-state';

export function ScenarioEditorDeckAiPanel(props: {
  aiState: ScenarioEditorDeckAiState;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  project: ScenarioProjectV3;
  selectedElement: ScenarioElement | null;
  selectedSlide: ScenarioSlide;
}) {
  const disabled = props.aiState.loading || props.aiState.instruction.trim().length === 0;

  return (
    <aside
      className="absolute right-3 top-[4.5rem] z-50 flex max-h-[min(42rem,calc(100vh-5.25rem))]
        w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[8px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] shadow-xl
        max-[980px]:top-[8rem] max-[720px]:bottom-[5.75rem] max-[720px]:left-3 max-[720px]:top-[4.75rem]
        max-[720px]:max-h-none max-[720px]:w-auto"
      data-ui="scenario.editor.ai-panel"
    >
      <ScenarioEditorDeckAiHeader onClose={props.onClose} />
      <div className="grid min-h-0 content-start gap-4 overflow-auto p-4">
        <ScenarioEditorDeckAiContext
          project={props.project}
          selectedElement={props.selectedElement}
          selectedSlide={props.selectedSlide}
        />
        <ScenarioEditorDeckAiForm
          aiState={props.aiState}
          disabled={disabled}
          onSubmit={props.onSubmit}
        />
        <ScenarioEditorDeckAiRunSummary aiState={props.aiState} />
      </div>
    </aside>
  );
}

function ScenarioEditorDeckAiHeader(props: { onClose: () => void }) {
  return (
    <div
      className="flex items-center justify-between border-b border-[var(--sniptale-color-border-soft)]
        px-4 py-3"
    >
      <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('scenario.editor.aiEditorTool')}
      </div>
      <button
        type="button"
        onClick={props.onClose}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--sniptale-color-text-muted)]
          hover:bg-[var(--sniptale-color-surface-muted)] hover:text-[var(--sniptale-color-text-primary)]"
        title={translate('scenario.editor.aiEditorClose')}
        aria-label={translate('scenario.editor.aiEditorClose')}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function ScenarioEditorDeckAiContext(props: {
  project: ScenarioProjectV3;
  selectedElement: ScenarioElement | null;
  selectedSlide: ScenarioSlide;
}) {
  return (
    <div
      className="grid gap-2 rounded-[12px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-muted)] p-3 text-xs"
      data-ui="scenario.editor.ai-context"
    >
      <ScenarioEditorDeckAiContextRow
        label={translate('scenario.editor.aiEditorDeckContext')}
        value={`${props.project.name} · ${props.project.slides.length} ${translate('scenario.editor.slides')}`}
      />
      <ScenarioEditorDeckAiContextRow
        label={translate('scenario.editor.aiEditorSlideContext')}
        value={props.selectedSlide.title || translate('scenario.editor.untitledSlide')}
      />
      <ScenarioEditorDeckAiContextRow
        label={translate('scenario.editor.aiEditorSelectionContext')}
        value={props.selectedElement?.name ?? translate('scenario.editor.aiEditorNoSelection')}
      />
    </div>
  );
}

function ScenarioEditorDeckAiContextRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      <span className="truncate font-medium text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </span>
    </div>
  );
}

function ScenarioEditorDeckAiForm(props: {
  aiState: ScenarioEditorDeckAiState;
  disabled: boolean;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      <ProductTextarea
        value={props.aiState.instruction}
        onChange={(event) => props.aiState.setInstruction(event.target.value)}
        placeholder={translate('scenario.editor.aiEditorDeckInstructionPlaceholder')}
        rows={6}
        style={{ marginBottom: 0 }}
      />
      <AIModelSelector
        disabled={props.aiState.loading}
        models={props.aiState.availableModels}
        onSelect={props.aiState.setSelectedModelId}
        providers={props.aiState.providers}
        selectedModelId={props.aiState.selectedModelId}
      />
      <ScenarioEditorDeckAiDisclosure aiState={props.aiState} />
      <ProductActionButton
        onClick={() => void props.onSubmit()}
        disabled={props.disabled}
        tone="primary"
      >
        {props.aiState.loading ? (
          <>
            <div className="sniptale-spinner-inline" />
            {translate('scenario.editor.aiEditorSending')}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {translate('scenario.editor.aiEditorSend')}
          </>
        )}
      </ProductActionButton>
      <ScenarioEditorDeckAiError error={props.aiState.error} />
    </div>
  );
}

function ScenarioEditorDeckAiDisclosure(props: { aiState: ScenarioEditorDeckAiState }) {
  return (
    <ScenarioAiDisclosurePanel
      summary={createScenarioAiDisclosureSummary({
        contract: 'deck',
        models: props.aiState.availableModels,
        providers: props.aiState.providers,
        screenshotsCount: 0,
        selectedModelId: props.aiState.selectedModelId,
      })}
    />
  );
}

function ScenarioEditorDeckAiError(props: { error: string | null }) {
  if (!props.error) {
    return null;
  }

  return (
    <div
      className="rounded-[12px] border border-[var(--sniptale-color-danger)] px-3 py-2 text-sm
        text-[var(--sniptale-color-danger)]"
      role="alert"
    >
      {props.error}
    </div>
  );
}

function ScenarioEditorDeckAiRunSummary(props: { aiState: ScenarioEditorDeckAiState }) {
  const summary = props.aiState.lastRunSummary;
  if (!summary) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-[12px] border border-[var(--sniptale-color-border-soft)] p-3">
      <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('scenario.editor.aiEditorLastRun')}
      </div>
      <div className="grid gap-1">
        {summary.appliedOperations.length > 0 ? (
          summary.appliedOperations.map((operation, index) => (
            <div
              key={`${operation.type}-${index}`}
              className="text-xs text-[var(--sniptale-color-text-secondary)]"
            >
              {summarizeScenarioAiOperation(operation)}
            </div>
          ))
        ) : (
          <div className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('scenario.editor.aiEditorNoAppliedChanges')}
          </div>
        )}
      </div>
    </div>
  );
}
