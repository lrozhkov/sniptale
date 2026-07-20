import { translate } from '../../../platform/i18n';
import type { InspectorCommandParams } from '../compact/inspector/command-types';
import { ColorField, cx } from '../../chrome/ui';
import { WorkspaceDefaultAction } from './default-action';

function WorkspacePaletteButton(props: { active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.color}
      onClick={props.onClick}
      className={cx(
        'h-10 rounded-[12px] border transition hover:-translate-y-px',
        props.active
          ? 'border-[color:var(--sniptale-color-border-accent-strong)] ' +
              'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)]'
          : 'border-[color:var(--sniptale-color-border-soft)]'
      )}
      style={{ backgroundColor: props.color }}
    />
  );
}

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
  const currentColor = params.workspace.backgroundColor.toLowerCase();

  return (
    <div className="grid grid-cols-4 gap-2">
      {params.workspaceBackgroundPalette.map((color) => (
        <WorkspacePaletteButton
          key={color}
          active={currentColor === color.toLowerCase()}
          color={color}
          onClick={() => params.applyWorkspaceColor(color)}
        />
      ))}
    </div>
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
