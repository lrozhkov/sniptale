import { ShieldCheck } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import type {
  ScenarioAiDisclosureSummary,
  ScenarioAiProviderKind,
  ScenarioAiStructuredFieldKey,
} from './disclosure/summary';

export function ScenarioAiDisclosurePanel(props: { summary: ScenarioAiDisclosureSummary }) {
  return (
    <div
      className="grid gap-2 rounded-[12px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-muted)] p-3 text-xs"
      data-ui="scenario.editor.ai-disclosure"
    >
      <div className="flex items-center gap-2 font-semibold text-[var(--sniptale-color-text-primary)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>{translate('scenario.editor.aiEditorDisclosureTitle')}</span>
      </div>
      <ScenarioAiDisclosureRow
        label={translate('scenario.editor.aiEditorDisclosureProvider')}
        value={`${props.summary.providerLabel} · ${translateProviderKind(props.summary.providerKind)}`}
      />
      <ScenarioAiDisclosureRow
        label={translate('scenario.editor.aiEditorDisclosureModel')}
        value={props.summary.modelLabel}
      />
      <ScenarioAiDisclosureRow
        label={translate('scenario.editor.aiEditorDisclosureScreenshots')}
        value={String(props.summary.screenshotsCount)}
      />
      <ScenarioAiDisclosureRow
        label={translate('scenario.editor.aiEditorDisclosureStructuredFields')}
        value={props.summary.structuredFieldKeys.map(translateStructuredField).join(', ')}
      />
    </div>
  );
}

function ScenarioAiDisclosureRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.75rem_1fr] gap-2">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      <span className="min-w-0 break-words font-medium text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </span>
    </div>
  );
}

function translateProviderKind(kind: ScenarioAiProviderKind): string {
  switch (kind) {
    case 'chrome-built-in':
      return translate('scenario.editor.aiEditorDisclosureProviderChrome');
    case 'external':
      return translate('scenario.editor.aiEditorDisclosureProviderExternal');
    case 'local-custom':
      return translate('scenario.editor.aiEditorDisclosureProviderLocalCustom');
  }
}

function translateStructuredField(key: ScenarioAiStructuredFieldKey): string {
  switch (key) {
    case 'attachments':
      return translate('scenario.editor.aiEditorDisclosureFieldAttachments');
    case 'deckOutline':
      return translate('scenario.editor.aiEditorDisclosureFieldDeckOutline');
    case 'instruction':
      return translate('scenario.editor.aiEditorDisclosureFieldInstruction');
    case 'pageContext':
      return translate('scenario.editor.aiEditorDisclosureFieldPageContext');
    case 'projectSnapshot':
      return translate('scenario.editor.aiEditorDisclosureFieldProjectSnapshot');
    case 'selectedSlideCode':
      return translate('scenario.editor.aiEditorDisclosureFieldSelectedSlideCode');
    case 'stepContent':
      return translate('scenario.editor.aiEditorDisclosureFieldStepContent');
    case 'targetMetadata':
      return translate('scenario.editor.aiEditorDisclosureFieldTargetMetadata');
    case 'toolManifest':
      return translate('scenario.editor.aiEditorDisclosureFieldToolManifest');
  }
}
