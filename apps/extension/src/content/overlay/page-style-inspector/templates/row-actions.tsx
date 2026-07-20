import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleInspectorActions, PageStyleTemplateActionOutcome } from '../types';
import type { Template } from './model';
import type { useTemplateActionRunner } from './status';

export type TemplateActionRunner = ReturnType<typeof useTemplateActionRunner>;

export function TemplateRowActions(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  disabledReason: string | null;
  pending: boolean;
  template: Template;
}) {
  const disabled = props.pending || Boolean(props.disabledReason);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1">
      <ApplyTemplateAction {...props} disabled={disabled} />
      <UpdateTemplateAction {...props} disabled={disabled} />
      <DuplicateTemplateAction {...props} />
      <DeleteTemplateAction {...props} />
    </div>
  );
}

function runTemplateAction(args: {
  action: () => Promise<PageStyleTemplateActionOutcome>;
  actionRunner: TemplateActionRunner;
  kind: 'apply' | 'delete' | 'duplicate' | 'rename' | 'update';
  template: Template;
}) {
  void args.actionRunner.run({
    action: args.action,
    kind: args.kind,
    template: args.template,
  });
}

function ApplyTemplateAction(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  disabled: boolean;
  template: Template;
}) {
  return (
    <TextAction
      disabled={props.disabled}
      label={translate('content.pageStyleInspector.applyTemplate')}
      onClick={() =>
        runTemplateAction({
          action: () => props.actions.applyTemplate(props.template),
          actionRunner: props.actionRunner,
          kind: 'apply',
          template: props.template,
        })
      }
    />
  );
}

function UpdateTemplateAction(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  disabled: boolean;
  template: Template;
}) {
  return (
    <IconAction
      disabled={props.disabled}
      icon={<RefreshCw size={14} />}
      label={translate('content.pageStyleInspector.updateTemplate')}
      onClick={() =>
        runTemplateAction({
          action: () => props.actions.updateTemplate(props.template),
          actionRunner: props.actionRunner,
          kind: 'update',
          template: props.template,
        })
      }
    />
  );
}

function DuplicateTemplateAction(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  pending: boolean;
  template: Template;
}) {
  return (
    <IconAction
      disabled={props.pending}
      icon={<Copy size={14} />}
      label={translate('content.pageStyleInspector.duplicateTemplate')}
      onClick={() =>
        runTemplateAction({
          action: () => props.actions.duplicateTemplate(props.template),
          actionRunner: props.actionRunner,
          kind: 'duplicate',
          template: props.template,
        })
      }
    />
  );
}

function DeleteTemplateAction(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  pending: boolean;
  template: Template;
}) {
  return (
    <IconAction
      danger
      disabled={props.pending}
      icon={<Trash2 size={14} />}
      label={translate('content.pageStyleInspector.deleteTemplate')}
      onClick={() =>
        runTemplateAction({
          action: () => props.actions.deleteTemplate(props.template),
          actionRunner: props.actionRunner,
          kind: 'delete',
          template: props.template,
        })
      }
    />
  );
}

function TextAction(props: { disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={[
        'h-8 rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] px-3',
        'text-xs font-bold disabled:opacity-45',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export function IconAction(props: {
  danger?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border',
        'border-[color:var(--sniptale-color-border-soft)] disabled:opacity-45',
        props.danger
          ? 'text-[var(--sniptale-color-danger)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}
