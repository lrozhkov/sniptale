import { translate } from '../../../platform/i18n';
import { ColorField, cx } from '../../chrome/ui';
import { WorkspaceDefaultAction } from '../workspace-color/default-action';
import { PanelSection } from './shared';

export function WorkspacePanelBody(props: {
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  palette: readonly string[];
  previewWorkspaceColor: (color: string) => void;
  recentColors: string[];
  workspaceBackgroundColor: string;
  workspaceColorError: string | null;
  workspaceColorMatchesDefault: boolean;
  workspaceDefaultSavePending: boolean;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
}) {
  return (
    <div className="space-y-3">
      <WorkspaceColorSection {...props} />
      <WorkspacePresetSection {...props} />
      <WorkspaceDefaultAction
        error={props.workspaceColorError}
        isPending={props.workspaceDefaultSavePending}
        matchesDefault={props.workspaceColorMatchesDefault}
        onSaveAsDefault={props.saveWorkspaceColorAsDefault}
      />
    </div>
  );
}

function WorkspaceColorSection(props: {
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  palette: readonly string[];
  previewWorkspaceColor: (color: string) => void;
  recentColors: string[];
  workspaceBackgroundColor: string;
}) {
  return (
    <ColorField
      title={translate('editor.compact.workspaceColor')}
      label={translate('editor.compact.workspaceColor')}
      value={props.workspaceBackgroundColor}
      recentColors={props.recentColors}
      palette={props.palette}
      onChange={props.applyWorkspaceColor}
      onPreviewChange={props.previewWorkspaceColor}
      onPreviewReset={props.previewWorkspaceColor}
    />
  );
}

function WorkspacePresetSection(props: {
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  palette: readonly string[];
  workspaceBackgroundColor: string;
}) {
  return (
    <PanelSection label={translate('editor.compact.neutralPresets')}>
      <div className="grid grid-cols-4 gap-2">
        {props.palette.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => props.applyWorkspaceColor(color)}
            className={cx(
              'h-10 rounded-[12px] border transition hover:-translate-y-px',
              props.workspaceBackgroundColor.toLowerCase() === color
                ? 'border-[color:var(--sniptale-color-border-accent-strong)] ' +
                    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]'
                : 'border-[color:var(--sniptale-color-border-soft)]'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </PanelSection>
  );
}
