import { Sparkles, Wand2 } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { createScenarioAiDisclosureSummary } from '../../project/ai/disclosure/summary';
import { AIModelSelector } from '../../../features/ai/model-selector';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { ScenarioAiDisclosurePanel } from '../../project/ai/disclosure-panel';
import type { ScenarioAiEditorController } from './types';

function ScenarioAiEditorHeader(props: { onCollapse: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.aiEditorTool')}
      </div>
      <button
        type="button"
        onClick={props.onCollapse}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border
          border-[var(--sniptale-color-border-soft)]"
        title={translate('scenario.editor.collapseNavigator')}
        aria-label={translate('scenario.editor.collapseNavigator')}
      >
        <Wand2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ScenarioAiEditorRunSummary(props: { controller: ScenarioAiEditorController }) {
  const summary = props.controller.ai.lastRunSummary;
  if (!summary) {
    return null;
  }

  const changedSteps = summary.appliedStepIds
    .map(
      (stepId) => props.controller.project.project?.steps.find((step) => step.id === stepId) ?? null
    )
    .filter((step): step is NonNullable<typeof step> => step !== null);

  return (
    <div className="grid gap-3 rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-3">
      <div>
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.aiEditorLastRun')}
        </div>
        <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
          {new Date(summary.submittedAt).toLocaleString()}
        </div>
      </div>

      {changedSteps.length > 0 ? (
        <div className="grid gap-2">
          {changedSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => props.controller.project.setSelectedStepId(step.id)}
              className="flex items-center justify-between rounded-[14px] border
                border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-3 py-2
                text-left text-sm text-[var(--sniptale-color-text-primary)]"
            >
              <span className="truncate">
                {index + 1}. {step.title || translate('scenario.editor.untitledStep')}
              </span>
              <span className="text-xs text-[var(--sniptale-color-text-muted)]">{step.kind}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.aiEditorNoAppliedChanges')}
        </div>
      )}
    </div>
  );
}

function ScenarioAiEditorProjectHint(props: { controller: ScenarioAiEditorController }) {
  if (props.controller.project.project) {
    const activeDisclosure =
      props.controller.ai.loading && props.controller.ai.activeAttachmentDisclosure
        ? props.controller.ai.activeAttachmentDisclosure
        : null;
    const attachmentMode = activeDisclosure?.mode ?? props.controller.ai.attachmentMode;
    const selectedStepId =
      activeDisclosure?.selectedStepId ?? props.controller.project.selectedStepId;
    const selectedStep = props.controller.project.project.steps.find(
      (step) => step.id === selectedStepId
    );
    const selectedCaptureCount =
      activeDisclosure?.screenshotCount ?? (selectedStep?.kind === 'capture' ? 1 : 0);

    return (
      <div
        className="rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-3
          text-xs text-[var(--sniptale-color-text-muted)]"
      >
        <div>
          {translate('scenario.editor.aiEditorProjectHint')}{' '}
          {props.controller.project.project.steps.length}
        </div>
        <div className="mt-1">
          {translate('scenario.editor.aiEditorAttachmentDisclosure')}{' '}
          {attachmentMode === 'current' ? selectedCaptureCount : 0}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[18px] border border-dashed border-[var(--sniptale-color-border-soft)] p-4
        text-sm text-[var(--sniptale-color-text-muted)]"
    >
      {translate('scenario.editor.aiEditorEmptyProject')}
    </div>
  );
}

function ScenarioAiEditorAttachmentMode(props: { controller: ScenarioAiEditorController }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.aiEditorAttachments')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['current', 'none'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={props.controller.ai.loading}
            onClick={() => props.controller.ai.setAttachmentMode(mode)}
            className={`rounded-[14px] border px-3 py-2 text-left text-xs ${
              props.controller.ai.attachmentMode === mode
                ? 'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent-soft)]'
                : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]'
            }`}
          >
            {translate(
              mode === 'current'
                ? 'scenario.editor.aiEditorAttachmentCurrent'
                : 'scenario.editor.aiEditorAttachmentNone'
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function createScenarioAiEditorDisclosureSummary(props: {
  controller: ScenarioAiEditorController;
}) {
  const project = props.controller.project.project;
  const activeDisclosure =
    props.controller.ai.loading && props.controller.ai.activeAttachmentDisclosure
      ? props.controller.ai.activeAttachmentDisclosure
      : null;
  const selectedStep = project?.steps.find(
    (step) =>
      step.id === (activeDisclosure?.selectedStepId ?? props.controller.project.selectedStepId)
  );
  const screenshotsCount =
    activeDisclosure?.screenshotCount ??
    (props.controller.ai.attachmentMode === 'current' && selectedStep?.kind === 'capture' ? 1 : 0);

  return createScenarioAiDisclosureSummary({
    contract: 'legacy',
    models: props.controller.ai.availableModels,
    providers: props.controller.ai.providers,
    screenshotsCount,
    selectedModelId: props.controller.ai.selectedModelId,
  });
}

function ScenarioAiEditorSubmitButton(props: {
  controller: ScenarioAiEditorController;
  disabled: boolean;
}) {
  return (
    <ProductActionButton
      onClick={() => void props.controller.ai.submitRequest()}
      disabled={props.disabled}
      tone="primary"
    >
      {props.controller.ai.loading ? (
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
  );
}

function ScenarioAiEditorErrorNotice(props: { error: string | null }) {
  if (!props.error) {
    return null;
  }

  return (
    <div
      className="rounded-[14px] border border-[var(--sniptale-color-danger)] px-3 py-2
        text-sm text-[var(--sniptale-color-danger)]"
    >
      {props.error}
    </div>
  );
}

function ScenarioAiEditorForm(props: {
  controller: ScenarioAiEditorController;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-3">
      <div>
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.aiEditorInstruction')}
        </div>
        <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.aiEditorInstructionHint')}
        </div>
      </div>

      <ProductTextarea
        value={props.controller.ai.instruction}
        onChange={(event) => props.controller.ai.setInstruction(event.target.value)}
        placeholder={translate('scenario.editor.aiEditorInstructionPlaceholder')}
        rows={7}
        style={{ marginBottom: 0 }}
      />

      <div className="grid gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.aiEditorModel')}
        </div>
        <AIModelSelector
          disabled={props.controller.ai.loading}
          models={props.controller.ai.availableModels}
          onSelect={props.controller.ai.setSelectedModelId}
          providers={props.controller.ai.providers}
          selectedModelId={props.controller.ai.selectedModelId}
        />
      </div>

      <ScenarioAiEditorAttachmentMode controller={props.controller} />
      <ScenarioAiDisclosurePanel
        summary={createScenarioAiEditorDisclosureSummary({ controller: props.controller })}
      />

      <ScenarioAiEditorSubmitButton controller={props.controller} disabled={props.disabled} />
      <ScenarioAiEditorErrorNotice error={props.controller.ai.error} />
    </div>
  );
}

export function ScenarioSlideNavigatorAiEditorView(props: {
  controller: ScenarioAiEditorController;
}) {
  const disabled =
    props.controller.ai.loading ||
    !props.controller.project.project ||
    props.controller.ai.instruction.trim().length === 0;

  return (
    <div className="grid min-h-0 gap-4 p-3">
      <ScenarioAiEditorHeader onCollapse={() => props.controller.ui.setNavigatorCollapsed(true)} />
      <ScenarioAiEditorProjectHint controller={props.controller} />
      <ScenarioAiEditorForm controller={props.controller} disabled={disabled} />
      <ScenarioAiEditorRunSummary controller={props.controller} />
    </div>
  );
}
