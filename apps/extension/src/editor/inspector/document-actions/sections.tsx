import { fireAndReportEditorAction } from '../../runtime/async-actions';
import type { EditorDocumentActionGroup } from './model/types';
import type { AsyncFeedbackStatus } from './feedback';
import {
  actionLabelClassName,
  actionMetaClassName,
  getActionButtonClassName,
  getActionIconClassName,
  resolveActionFeedbackBadge,
} from './helpers';

function shouldRenderGroupDivider(groupId: EditorDocumentActionGroup['id']): boolean {
  switch (groupId) {
    case 'quick-destinations':
    case 'image-format':
    case 'session':
      return true;
    case 'primary-save':
    case 'save-utilities':
    case 'open-image':
    case 'close':
      return false;
  }
}

function getGroupSectionClassName(groupId: EditorDocumentActionGroup['id']): string | undefined {
  if (!shouldRenderGroupDivider(groupId)) {
    return undefined;
  }

  return [
    'border-b border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
    'pb-2.5',
  ].join(' ');
}

function EditorDocumentActionButton({
  action,
  status = 'idle',
}: {
  action: EditorDocumentActionGroup['items'][number] & { kind: 'command' };
  status?: AsyncFeedbackStatus;
}) {
  const Icon = action.icon;
  const feedbackBadge = resolveActionFeedbackBadge(action, status);

  return (
    <button
      type="button"
      data-emphasis={action.emphasis}
      data-tone={action.emphasis === 'danger' ? 'danger' : 'default'}
      data-ui={`editor.file-actions.action.${action.id}`}
      title={action.disabledReason}
      disabled={status === 'saving' || action.disabled}
      className={getActionButtonClassName(action)}
      onClick={() => fireAndReportEditorAction(`document-action:${action.id}`, action.onClick)}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={
            'flex h-4 w-4 shrink-0 items-center justify-center ' + getActionIconClassName(action)
          }
        >
          <Icon size={action.id === 'save-image' ? 17 : 16} strokeWidth={2} />
        </span>
        <span className={actionLabelClassName}>{action.label}</span>
      </span>
      {feedbackBadge ??
        (action.meta ? <span className={actionMetaClassName}>{action.meta}</span> : null)}
    </button>
  );
}

export function EditorDocumentActionGroupSection({
  getActionStatus,
  group,
}: {
  getActionStatus: (actionId: string) => AsyncFeedbackStatus;
  group: EditorDocumentActionGroup;
}) {
  return (
    <section
      data-ui={`editor.file-actions.group.${group.id}`}
      className={getGroupSectionClassName(group.id)}
    >
      <div className={group.layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1.5'}>
        {group.items.map((item) =>
          item.kind === 'command' ? (
            <EditorDocumentActionButton
              key={item.id}
              action={item}
              status={getActionStatus(item.id)}
            />
          ) : (
            <div key={item.id} data-ui={`editor.file-actions.content.${item.id}`}>
              {item.content}
            </div>
          )
        )}
      </div>
    </section>
  );
}
