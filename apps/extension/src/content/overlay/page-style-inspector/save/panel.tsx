import { useCallback, useRef, useState, type ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import { isPageStyleRulesUiEnabled } from '../../../../platform/config/page-style-rules-access';
import { CompactInput } from '../../../../ui/compact-inspector-controls';
import { RetentionToggle } from '../property-controls/fields';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

function PanelAction(props: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  const className = props.primary
    ? [
        'h-9 rounded-[8px] bg-[var(--sniptale-color-text-primary)] text-xs font-bold',
        'text-[var(--sniptale-color-surface-panel)] disabled:opacity-45',
      ].join(' ')
    : [
        'h-9 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)]',
        'text-xs font-bold disabled:opacity-45',
      ].join(' ');

  return (
    <button type="button" disabled={props.disabled} className={className} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function SaveCard(props: { children: ReactNode; summary: string; title: string }) {
  return (
    <section className="grid gap-2 rounded-[10px] border border-[color:var(--sniptale-color-border-soft)] p-2.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-[var(--sniptale-color-text-primary)]">
          {props.title}
        </h3>
        <span className="truncate text-[10px] font-semibold text-[var(--sniptale-color-text-dim)]">
          {props.summary}
        </span>
      </div>
      {props.children}
    </section>
  );
}

function SaveExpandButton(props: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={[
        'h-9 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)]',
        'px-3 text-xs font-bold text-[var(--sniptale-color-text-primary)] transition',
        'hover:border-[color:var(--sniptale-color-accent)] hover:text-[var(--sniptale-color-accent)]',
        'disabled:opacity-45',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function SavePanelButtons(props: {
  disabled: boolean;
  onToggle: (panel: 'rule' | 'template') => void;
  showRuleSave: boolean;
}) {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: props.showRuleSave ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
      }}
    >
      <SaveExpandButton disabled={props.disabled} onClick={() => props.onToggle('template')}>
        {translate('content.pageStyleInspector.saveAsTemplate')}
      </SaveExpandButton>
      {props.showRuleSave ? (
        <SaveExpandButton disabled={props.disabled} onClick={() => props.onToggle('rule')}>
          {translate('content.pageStyleInspector.saveAsRule')}
        </SaveExpandButton>
      ) : null}
    </div>
  );
}

function TemplateSaveCard(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const saveRunner = useSaveCardActionRunner();

  return (
    <SaveCard
      title={translate('content.pageStyleInspector.defaultTemplateName')}
      summary={`${props.state.modifiedProperties.length} ${translate(
        'content.pageStyleInspector.changedSummarySuffix'
      )}`}
    >
      <CompactInput
        disabled={props.disabled}
        placeholder={translate('content.pageStyleInspector.templateName')}
        value={props.state.templateName}
        onChange={(event) => props.actions.setTemplateName(event.currentTarget.value)}
      />
      <RetentionToggle
        checked={props.state.includeComputedInTemplate}
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.includeComputedInTemplate')}
        onChange={props.actions.setIncludeComputedInTemplate}
      />
      <SaveCardStatus status={saveRunner.status} />
      <PanelAction
        disabled={props.disabled || saveRunner.status?.state === 'pending'}
        onClick={() =>
          void saveRunner.run({
            action: props.actions.saveTemplate,
            successMessage: translate('content.pageStyleInspector.saveTemplateSuccess'),
          })
        }
      >
        {translate('content.pageStyleInspector.save')}
      </PanelAction>
    </SaveCard>
  );
}

type SaveCardActionStatus = {
  message: string;
  state: 'error' | 'pending' | 'success';
};

function useSaveCardActionRunner() {
  const [status, setStatus] = useState<SaveCardActionStatus | null>(null);
  const sequenceRef = useRef(0);

  const run = useCallback(async (args: { action: () => Promise<void>; successMessage: string }) => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    setStatus({
      message: translate('content.pageStyleInspector.saveTemplatePending'),
      state: 'pending',
    });

    try {
      await args.action();
      if (sequenceRef.current === sequence) {
        setStatus({ message: args.successMessage, state: 'success' });
      }
    } catch {
      if (sequenceRef.current === sequence) {
        setStatus({
          message: translate('content.pageStyleInspector.saveTemplateFailed'),
          state: 'error',
        });
      }
    }
  }, []);

  return { run, status };
}

function SaveCardStatus(props: { status: SaveCardActionStatus | null }) {
  if (!props.status) {
    return null;
  }

  const tone = {
    error: 'border-[var(--sniptale-color-danger)] text-[var(--sniptale-color-danger)]',
    pending:
      'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
    success:
      'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
  }[props.status.state];

  return (
    <div className={['rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold', tone].join(' ')}>
      {props.status.message}
    </div>
  );
}

function RuleSaveCard(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  return (
    <SaveCard
      title={translate('content.pageStyleInspector.defaultRuleName')}
      summary={translate('content.pageStyleInspector.ruleExactAddressHint')}
    >
      <CompactInput
        disabled={props.disabled}
        placeholder={translate('content.pageStyleInspector.ruleName')}
        value={props.state.ruleName}
        onChange={(event) => props.actions.setRuleName(event.currentTarget.value)}
      />
      <RuleRetentionOptions {...props} />
      <PanelAction primary disabled={props.disabled} onClick={() => void props.actions.saveRule()}>
        {translate('content.pageStyleInspector.save')}
      </PanelAction>
    </SaveCard>
  );
}

function RuleRetentionOptions(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-[10px] font-semibold text-[var(--sniptale-color-text-dim)]">
        {translate('content.pageStyleInspector.contentRetentionTitle')}
      </div>
      <RetentionToggle
        checked={props.state.retainText}
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.retainText')}
        onChange={props.actions.setRetainText}
      />
      <RetentionToggle
        checked={props.state.retainImage}
        disabled={props.disabled || props.state.selection?.kind !== 'image'}
        label={translate('content.pageStyleInspector.retainImage')}
        onChange={props.actions.setRetainImage}
      />
    </div>
  );
}

export function SavePanel(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const [expanded, setExpanded] = useState<'rule' | 'template' | null>(null);
  const showRuleSave = isPageStyleRulesUiEnabled();

  return (
    <div className="grid gap-2">
      <SavePanelButtons
        disabled={props.disabled}
        showRuleSave={showRuleSave}
        onToggle={(panel) =>
          setExpanded((current) => {
            if (panel === 'rule' && !showRuleSave) {
              return current;
            }

            return current === panel ? null : panel;
          })
        }
      />

      {expanded === 'template' ? (
        <TemplateSaveCard actions={props.actions} disabled={props.disabled} state={props.state} />
      ) : null}

      {expanded === 'rule' && showRuleSave ? (
        <RuleSaveCard actions={props.actions} disabled={props.disabled} state={props.state} />
      ) : null}
    </div>
  );
}
