import { useState } from 'react';
import { translate } from '../../../platform/i18n';
import { patchEditorWorkspaceDefaults } from '../../persistence/workspace';
import { useEditorStore } from '../../state/useEditorStore';

export function SelectionVisibilitySetting() {
  const enabled = useEditorStore((state) => state.workspace.hideSelectionWhileDragging);
  const updateWorkspace = useEditorStore((state) => state.updateWorkspace);
  const updateWorkspaceDefaults = useEditorStore((state) => state.updateWorkspaceDefaults);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    if (pending) return;
    const next = !enabled;
    setPending(true);
    setError(false);
    updateWorkspace({ hideSelectionWhileDragging: next });
    try {
      const defaults = await patchEditorWorkspaceDefaults({ hideSelectionWhileDragging: next });
      updateWorkspaceDefaults(defaults);
    } catch {
      updateWorkspace({ hideSelectionWhileDragging: enabled });
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>{translate('editor.compact.hideSelectionWhileDragging')}</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={() => void toggle()}
          className="accent-[color:var(--sniptale-color-accent)]"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {translate('editor.compact.selectionVisibilitySaveFailed')}
        </p>
      )}
    </div>
  );
}
