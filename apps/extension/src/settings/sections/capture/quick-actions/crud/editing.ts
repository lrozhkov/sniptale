import type { QuickAction } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import {
  isBundledQuickAction,
  resetBundledQuickAction,
} from '../../../../../features/quick-actions-presets/catalog';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { createDefaultQuickAction } from '../section/helpers';
import { normalizeQuickActionEditorPolicy } from '../../../../../features/quick-actions-presets/policy';

export function beginNewQuickAction(
  setEditingId: (value: string) => void,
  setEditForm: (value: QuickAction) => void
) {
  const newAction = createDefaultQuickAction();
  setEditingId(newAction.id);
  setEditForm(newAction);
}

export function beginEditQuickAction(
  action: QuickAction,
  setEditingId: (value: string) => void,
  setEditForm: (value: QuickAction) => void
) {
  setEditingId(action.id);
  setEditForm({ ...action });
}

export function updateQuickActionField<K extends keyof QuickAction>(
  editForm: QuickAction | null,
  field: K,
  value: QuickAction[K],
  setEditForm: (value: QuickAction) => void
) {
  if (!editForm) {
    return;
  }

  setEditForm(normalizeQuickActionEditorPolicy({ ...editForm, [field]: value }));
}

export async function saveEditedQuickAction(props: {
  actions: QuickAction[];
  editForm: QuickAction | null;
  onPersist: (actions: QuickAction[]) => Promise<boolean>;
  onResetEditor: () => void;
}) {
  if (!props.editForm) {
    return;
  }

  if (!props.editForm.name.trim()) {
    toast.error(translate('settings.quickActions.validationNameRequired'));
    return;
  }

  const normalizedEditForm = normalizeQuickActionEditorPolicy({
    ...props.editForm,
    ...(isBundledQuickAction(props.editForm) ? { customized: true } : {}),
  });
  const existingIndex = props.actions.findIndex((action) => action.id === normalizedEditForm.id);
  const updatedActions =
    existingIndex >= 0
      ? props.actions.map((action, index) =>
          index === existingIndex ? normalizedEditForm : action
        )
      : [...props.actions, normalizedEditForm];

  const wasPersisted = await props.onPersist(updatedActions);
  if (!wasPersisted) {
    return;
  }

  props.onResetEditor();
}

export async function resetQuickAction(
  actions: QuickAction[],
  id: string,
  onPersist: (actions: QuickAction[]) => Promise<boolean>
) {
  const index = actions.findIndex((action) => action.id === id);
  if (index < 0) return;

  const resetAction = resetBundledQuickAction(actions[index]!);
  if (!resetAction) return;

  await onPersist(
    actions.map((action, actionIndex) => (actionIndex === index ? resetAction : action))
  );
}

export async function deleteQuickAction(
  actions: QuickAction[],
  id: string,
  onPersist: (actions: QuickAction[]) => Promise<boolean>
) {
  const action = actions.find((candidate) => candidate.id === id);

  if (!action || isBundledQuickAction(action)) {
    return;
  }

  await onPersist(actions.filter((action) => action.id !== id));
}
