import { translate } from '../../../platform/i18n';
import type { InspectorCommandParams } from '../compact/inspector/command-types';
import { ProductGlassColorPalette } from '@sniptale/ui/product-glass-controls';
import { ColorField } from '../../chrome/ui';
import { WorkspaceDefaultAction } from './default-action';

export function renderCompactWorkspaceColorField(params: InspectorCommandParams) {
  return (
    <ColorField
      title={translate('editor.compact.workspaceColor')}
      label={translate('editor.compact.workspaceBacking')}
      value={params.workspace.backgroundColor}
      recentColors={params.recentColors}
      palette={params.workspaceBackgroundPalette}
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
    <div className="space-y-4">
      {renderCompactWorkspaceColorField(params)}
      {renderCompactWorkspacePaletteGrid(params)}
      {renderCompactWorkspaceDefaultAction(params)}
    </div>
  );
}
