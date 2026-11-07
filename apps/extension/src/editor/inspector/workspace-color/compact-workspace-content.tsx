import { RotateCcw } from 'lucide-react';
import { normalizeColor } from '@sniptale/foundation/color';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import type { InspectorCommandParams } from '../compact/inspector/command-types';
import { ProductGlassColorPalette } from '@sniptale/ui/product-glass-controls';
import { ColorField } from '../../chrome/ui';
import { WorkspaceDefaultAction } from './default-action';

export function renderCompactWorkspaceColorField(params: InspectorCommandParams) {
  return (
    <ColorField
      className="!min-h-8 !rounded-none !border-0 !bg-transparent !p-0"
      title={translate('editor.compact.workspaceColor')}
      label={translate('editor.compact.workspaceBacking')}
      value={params.workspace.backgroundColor}
      recentColors={params.recentColors}
      palette={params.workspaceBackgroundPalette}
      paletteInPicker
      onChange={params.applyWorkspaceColor}
      onPreviewChange={(color) => params.updateWorkspace({ backgroundColor: color })}
      onPreviewReset={(color) => params.updateWorkspace({ backgroundColor: color })}
    />
  );
}

export function renderCompactWorkspacePaletteGrid(params: InspectorCommandParams) {
  return (
    <ProductGlassColorPalette
      colors={[...params.workspaceBackgroundPalette]}
      value={params.workspace.backgroundColor}
      onSelect={(color) => void params.applyWorkspaceColor(color)}
    />
  );
}

export function renderCompactWorkspaceDefaultAction(params: InspectorCommandParams) {
  return (
    <WorkspaceDefaultAction
      error={params.workspaceColorError}
      isPending={params.workspaceDefaultSavePending}
      matchesDefault={params.workspaceColorMatchesDefault}
      onSaveAsDefault={params.saveWorkspaceColorAsDefault}
      variant="compact"
    />
  );
}

export function CompactWorkspaceColorPanel({ params }: { params: InspectorCommandParams }) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2"
      data-ui="editor.workspace.background-default-row"
    >
      {renderCompactWorkspaceColorField(params)}
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        className="h-8 w-8 min-w-8 shrink-0 !px-0"
        title={translate('editor.compact.workspaceResetColor')}
        aria-label={translate('editor.compact.workspaceResetColor')}
        disabled={
          normalizeColor(params.workspace.backgroundColor) ===
          normalizeColor(DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor)
        }
        onClick={() =>
          void params.applyWorkspaceColor(DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor)
        }
      >
        <RotateCcw size={16} aria-hidden="true" />
      </ProductActionButton>
    </div>
  );
}
