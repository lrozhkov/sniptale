import type { QuickAction } from '../../../../contracts/settings';
import {
  beginEditQuickAction,
  beginNewQuickAction,
  deleteQuickAction,
  saveEditedQuickAction,
  updateQuickActionField,
} from './editing';
import { persistQuickActions } from './persistence';
import { toggleQuickActionStatus } from './ordering';

export function createQuickActionsCrud(props: {
  actions: QuickAction[];
  editForm: QuickAction | null;
  resetEditor: () => void;
  setActions: (actions: QuickAction[]) => void;
  setEditingId: (value: string) => void;
  setEditForm: (value: QuickAction) => void;
  showConfirmation: (message: string) => void;
}) {
  const handlePersistActions = async (updatedActions: QuickAction[]) =>
    persistQuickActions(updatedActions, props.setActions);

  return {
    handleAdd: () => beginNewQuickAction(props.setEditingId, props.setEditForm),
    handleCancelEdit: () => props.resetEditor(),
    handleDelete: async (id: string) =>
      deleteQuickAction(props.actions, id, handlePersistActions, props.showConfirmation),
    handleEdit: (action: QuickAction) =>
      beginEditQuickAction(action, props.setEditingId, props.setEditForm),
    handleSaveEdit: async () =>
      saveEditedQuickAction({
        actions: props.actions,
        editForm: props.editForm,
        onPersist: handlePersistActions,
        onConfirm: props.showConfirmation,
        onResetEditor: props.resetEditor,
      }),
    handleToggleStatus: async (id: string) =>
      toggleQuickActionStatus(props.actions, id, handlePersistActions),
    updateFormField: <K extends keyof QuickAction>(field: K, value: QuickAction[K]) => {
      updateQuickActionField(props.editForm, field, value, props.setEditForm);
    },
  };
}
