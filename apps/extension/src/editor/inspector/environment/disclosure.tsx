import { translate } from '../../../platform/i18n';
import { ColorField, cx } from '../../chrome/ui';
import { WorkspaceDefaultAction } from '../workspace-color/default-action';
import { PanelSection } from './shared';
import { SelectionVisibilitySetting } from './selection-visibility';

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
    <div className="sniptale-parameter-stack">
      <WorkspaceColorSection {...props} />
      <WorkspacePresetSection {...props} />
      <WorkspaceDefaultAction
        error={props.workspaceColorError}
        isPending={props.workspaceDefaultSavePending}
        matchesDefault={props.workspaceColorMatchesDefault}
        onSaveAsDefault={props.saveWorkspaceColorAsDefault}
      />
      <SelectionVisibilitySetting />
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
            aria-label={color}
            aria-pressed={props.workspaceBackgroundColor.toLowerCase() === color}
            onClick={() => props.applyWorkspaceColor(color)}
            className={cx(
              'h-8 rounded-[4px] border transition-colors',
              props.workspaceBackgroundColor.toLowerCase() === color
                ? 'border-[color:var(--sniptale-color-border-strong)] ' +
                    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-text-primary)_16%,transparent)]'
                : 'border-[color:var(--sniptale-color-border-soft)]'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </PanelSection>
  );
}
