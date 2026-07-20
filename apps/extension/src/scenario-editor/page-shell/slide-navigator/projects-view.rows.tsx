import { useRef, useState, type KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import type { ScenarioProjectsViewController } from './types';

type ScenarioProjectsViewProject = {
  id: string;
  name: string;
};

type ScenarioProjectsViewEditingState = {
  editingName: string;
  editingProjectId: string | null;
  onEditingNameChange: (name: string) => void;
  onEditingProjectChange: (projectId: string | null) => void;
};

function useScenarioProjectNameCommitHandlers(
  props: ScenarioProjectsViewEditingState & {
    controller: ScenarioProjectsViewController;
  }
) {
  const skipBlurCommitRef = useRef(false);
  const commitRename = () => {
    void props.controller.projectCrud.renameProject(props.editingName);
    props.onEditingProjectChange(null);
  };

  return {
    handleBlur: () => {
      if (skipBlurCommitRef.current) {
        skipBlurCommitRef.current = false;
        return;
      }

      commitRename();
    },
    handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        skipBlurCommitRef.current = true;
        commitRename();
        return;
      }

      if (event.key === 'Escape') {
        skipBlurCommitRef.current = true;
        props.onEditingProjectChange(null);
      }
    },
  };
}

function ScenarioProjectNameField(
  props: ScenarioProjectsViewEditingState & {
    controller: ScenarioProjectsViewController;
    project: ScenarioProjectsViewProject;
  }
) {
  const { handleBlur, handleKeyDown } = useScenarioProjectNameCommitHandlers(props);

  if (props.editingProjectId !== props.project.id) {
    return (
      <button
        type="button"
        onClick={() => void props.controller.projectCrud.selectProject(props.project.id)}
        className="truncate text-left text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {props.project.name}
      </button>
    );
  }

  return (
    <input
      value={props.editingName}
      onChange={(event) => props.onEditingNameChange(event.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full rounded-[12px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-canvas)] px-3 py-2 text-sm outline-none"
      autoFocus
    />
  );
}

function ScenarioProjectRowActions(
  props: Pick<
    ScenarioProjectsViewEditingState,
    'onEditingNameChange' | 'onEditingProjectChange'
  > & {
    controller: ScenarioProjectsViewController;
    project: ScenarioProjectsViewProject;
  }
) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => {
          props.onEditingProjectChange(props.project.id);
          props.onEditingNameChange(props.project.name);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border
          border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-muted)]"
        title={translate('scenario.editor.renameProject')}
        aria-label={translate('scenario.editor.renameProject')}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <ScenarioProjectDeleteAction controller={props.controller} project={props.project} />
    </div>
  );
}

function ScenarioProjectDeleteAction(props: {
  controller: ScenarioProjectsViewController;
  project: ScenarioProjectsViewProject;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border
          border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-danger)]"
        title={translate('scenario.editor.deleteProject')}
        aria-label={translate('scenario.editor.deleteProject')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ProductConfirmDialog
        isOpen={confirmOpen}
        title={translate('scenario.editor.deleteProject')}
        message={translate('scenario.editor.deleteProjectConfirm')}
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void props.controller.projectCrud.deleteProject(props.project.id);
        }}
      />
    </>
  );
}

function ScenarioProjectRowPrimary(
  props: ScenarioProjectsViewEditingState & {
    controller: ScenarioProjectsViewController;
    dataUi?: string;
    onSelect: () => void;
    project: ScenarioProjectsViewProject;
  }
) {
  if (props.editingProjectId === props.project.id) {
    return <ScenarioProjectNameField {...props} />;
  }

  return (
    <button
      type="button"
      onClick={props.onSelect}
      data-ui={props.dataUi}
      className="w-full truncate text-left text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
    >
      {props.project.name}
    </button>
  );
}

export function ScenarioProjectRow(
  props: ScenarioProjectsViewEditingState & {
    active: boolean;
    controller: ScenarioProjectsViewController;
    dataUi?: string;
    onSelect: () => void;
    project: ScenarioProjectsViewProject;
  }
) {
  return (
    <div
      className={[
        'flex items-center gap-2 rounded-[16px] border px-3 py-3 transition',
        props.active
          ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
          : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <ScenarioProjectRowPrimary {...props} />
      </div>
      <ScenarioProjectRowActions
        controller={props.controller}
        onEditingNameChange={props.onEditingNameChange}
        onEditingProjectChange={props.onEditingProjectChange}
        project={props.project}
      />
    </div>
  );
}
