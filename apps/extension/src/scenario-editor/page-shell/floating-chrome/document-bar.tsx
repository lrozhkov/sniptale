import { RotateCcw } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  FloatingChromeDivider,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import type { ScenarioV3EditorSaveStatus } from '../types';
import {
  ScenarioAiActionButton,
  ScenarioExportActionButton,
  ScenarioHistoryActionButtons,
} from '../scenario-toolbar-actions';
import type { ScenarioV3FloatingEditor } from './types';

const DOCUMENT_BAR_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center overflow-visible',
  'max-[720px]:right-3'
);

const DOCUMENT_TITLE_CLASS_NAME =
  'flex min-w-[9rem] max-w-[20rem] flex-col px-2.5 max-[720px]:min-w-0 max-[720px]:max-w-[10rem]';
const DOCUMENT_STATUS_CLASS_NAME = [
  'mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold uppercase leading-none',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');
const DOCUMENT_RETRY_BUTTON_CLASS_NAME = [
  'inline-flex h-6 w-6 items-center justify-center rounded-[7px]',
  'text-[var(--sniptale-color-danger)] transition hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

export function ScenarioFloatingDocumentBar(props: {
  editor: ScenarioV3FloatingEditor;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  onOpenExport: () => void;
  onToggleAi: () => void;
}) {
  return (
    <div data-ui="scenario.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      <FloatingChromeToolbar dataUi="scenario.floating.document-bar.surface">
        <ScenarioFloatingDocumentSummary editor={props.editor} saveStatus={props.saveStatus} />
        <FloatingChromeDivider className="max-[720px]:hidden" />
        <ScenarioExportActionButton
          chrome
          dataUi="scenario.floating.document-bar.export"
          onOpenExport={props.onOpenExport}
        />
        <ScenarioAiActionButton
          chrome
          dataUi="scenario.floating.document-bar.ai"
          onToggleAi={props.onToggleAi}
        />
        <FloatingChromeDivider className="max-[720px]:hidden" />
        <ScenarioHistoryActionButtons
          dataUiPrefix="scenario.floating.document-bar"
          editor={props.editor}
          iconSize={17}
        />
      </FloatingChromeToolbar>
    </div>
  );
}

function ScenarioFloatingDocumentSummary(props: {
  editor: ScenarioV3FloatingEditor;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
}) {
  const status = resolveSaveStatus(props.saveStatus);

  return (
    <div className={DOCUMENT_TITLE_CLASS_NAME}>
      <div className="truncate text-sm font-semibold leading-snug text-[var(--sniptale-color-text-primary)]">
        {props.editor.project.name}
      </div>
      <div data-state={props.saveStatus?.state ?? 'idle'} className={DOCUMENT_STATUS_CLASS_NAME}>
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--sniptale-color-accent)]"
          aria-hidden="true"
        />
        <span className="truncate">{status.label}</span>
        {props.saveStatus?.state === 'error' ? (
          <button
            type="button"
            title={translate('scenario.editor.v3Retry')}
            aria-label={translate('scenario.editor.v3Retry')}
            onClick={() => void props.saveStatus?.retrySave()}
            className={DOCUMENT_RETRY_BUTTON_CLASS_NAME}
          >
            <RotateCcw size={13} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function resolveSaveStatus(saveStatus: ScenarioV3EditorSaveStatus | undefined): { label: string } {
  if (!saveStatus) {
    return { label: translate('common.states.draft') };
  }

  switch (saveStatus.state) {
    case 'saving':
      return { label: translate('scenario.editor.v3Saving') };
    case 'saved':
      return { label: translate('common.states.saved') };
    case 'error':
      return { label: saveStatus.error ?? translate('scenario.editor.v3SaveFailed') };
    case 'idle':
      return { label: translate('common.states.draft') };
  }
}
