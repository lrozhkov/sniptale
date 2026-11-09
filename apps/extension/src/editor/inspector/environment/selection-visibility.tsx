import { useState } from 'react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
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
    <div data-ui="editor.workspace.selection-visibility" className="sniptale-parameter-stack">
      <div
        data-inspector-toggle
        className="sniptale-parameter-row sniptale-boolean-parameter"
        title={translate('editor.compact.hideSelectionWhileDraggingHint')}
      >
        <span className="min-w-0 text-[13px] font-medium leading-[18px] text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.compact.hideSelectionWhileDragging')}
        </span>
        <div className="sniptale-parameter-value">
          <ProductGlassSwitch
            title={translate('editor.compact.hideSelectionWhileDraggingHint')}
            aria-label={translate('editor.compact.hideSelectionWhileDragging')}
            aria-pressed={enabled}
            on={enabled}
            disabled={pending}
            onClick={() => void toggle()}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {translate('editor.compact.selectionVisibilitySaveFailed')}
        </p>
      )}
    </div>
  );
}
