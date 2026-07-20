import type { QuickAction } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { isBundledQuickAction } from '../../../../features/quick-actions-presets/catalog';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { createDefaultQuickAction } from '../section/helpers';

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
  if (isBundledQuickAction(action)) {
    return;
  }

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

  setEditForm({ ...editForm, [field]: value });
}

export async function saveEditedQuickAction(props: {
  actions: QuickAction[];
  editForm: QuickAction | null;
  onPersist: (actions: QuickAction[]) => Promise<boolean>;
  onResetEditor: () => void;
  onConfirm: (message: string) => void;
}) {
  if (!props.editForm) {
    return;
  }

  if (isBundledQuickAction(props.editForm)) {
    props.onResetEditor();
    return;
  }

  if (!props.editForm.name.trim()) {
    toast.error(translate('settings.quickActions.validationNameRequired'));
    return;
  }

  const existingIndex = props.actions.findIndex((action) => action.id === props.editForm?.id);
  const updatedActions =
    existingIndex >= 0
      ? props.actions.map((action, index) => (index === existingIndex ? props.editForm! : action))
      : [...props.actions, props.editForm];

  const wasPersisted = await props.onPersist(updatedActions);
  if (!wasPersisted) {
    return;
  }

  props.onConfirm(
    translate(
      existingIndex >= 0
        ? 'settings.quickActions.messageUpdated'
        : 'settings.quickActions.messageCreated'
    )
  );
  props.onResetEditor();
}

export async function deleteQuickAction(
  actions: QuickAction[],
  id: string,
  onPersist: (actions: QuickAction[]) => Promise<boolean>,
  onConfirm: (message: string) => void
) {
  const action = actions.find((candidate) => candidate.id === id);

  if (!action || isBundledQuickAction(action)) {
    return;
  }

  const wasPersisted = await onPersist(actions.filter((action) => action.id !== id));
  if (!wasPersisted) {
    return;
  }
  onConfirm(translate('settings.quickActions.messageDeleted'));
}
