import { Eye, EyeOff, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { ImageEditorController } from '../../../controller';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { buildGridStyleCommands } from './grid-style-sections';
import {
  renderCompactWorkspaceColorField,
  renderCompactWorkspaceDefaultAction,
  renderCompactWorkspacePaletteGrid,
} from '../../workspace-color/compact-workspace-content';
import { EditorTechnicalDataPicker } from '../../technical-data-picker';
import { cx } from '../../../chrome/ui';

function buildGridPaletteButtons(params: InspectorCommandParams) {
  return params.gridColorPalette.map((color) => (
    <button
      key={color}
      type="button"
      title={color}
      onClick={() =>
        params.updateColor((next) => params.updateWorkspace({ gridColor: next }), color)
      }
      className={cx(
        'h-10 rounded-[12px] border transition hover:-translate-y-px',
        params.workspace.gridColor.toLowerCase() === color
          ? 'border-[color:var(--sniptale-color-border-accent-strong)] ' +
              'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)]'
          : 'border-[color:var(--sniptale-color-border-soft)]'
      )}
      style={{ backgroundColor: color }}
    />
  ));
}

function buildToggleCompactCommand(options: {
  active: boolean;
  activeTitle: string;
  icon: ReactNode;
  id: string;
  inactiveTitle: string;
  onClick: () => void;
}): CompactCommand {
  return {
    id: options.id,
    title: options.active ? options.activeTitle : options.inactiveTitle,
    trigger: options.icon,
    active: options.active,
    onClick: options.onClick,
  };
}

function buildGridToggleCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    buildToggleCompactCommand({
      id: 'grid-toggle',
      active: params.workspace.gridEnabled,
      activeTitle: translate('editor.compact.hideGrid'),
      inactiveTitle: translate('editor.compact.showGrid'),
      icon: params.workspace.gridEnabled ? (
        <EyeOff size={15} strokeWidth={2} />
      ) : (
        <Eye size={15} strokeWidth={2} />
      ),
      onClick: () => params.updateWorkspace({ gridEnabled: !params.workspace.gridEnabled }),
    }),
    buildToggleCompactCommand({
      id: 'grid-snap-toggle',
      active: params.workspace.gridSnapEnabled,
      activeTitle: translate('editor.compact.disableGridSnap'),
      inactiveTitle: translate('editor.compact.enableGridSnap'),
      icon: <Link2 size={15} strokeWidth={2} />,
      onClick: () => params.updateWorkspace({ gridSnapEnabled: !params.workspace.gridSnapEnabled }),
    }),
  ];
}

export function buildWorkspaceCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    {
      id: 'workspace-background',
      icon: 'color',
      title: translate('editor.compact.workspaceColor'),
      trigger: <CompactCommandToken>CLR</CompactCommandToken>,
      value: params.workspace.backgroundColor,
      content: (
        <CompactCommandField
          label={translate('editor.compact.workspaceColor')}
          value={params.workspace.backgroundColor}
        >
          <div className="space-y-3">
            {renderCompactWorkspaceColorField(params)}
            {renderCompactWorkspaceDefaultAction(params)}
          </div>
        </CompactCommandField>
      ),
    },
    {
      id: 'workspace-presets',
      icon: 'preset',
      title: translate('editor.compact.neutralPresets'),
      trigger: <CompactCommandToken>PRE</CompactCommandToken>,
      value: params.workspace.backgroundColor,
      content: (
        <CompactCommandField
          label={translate('editor.compact.neutralPresets')}
          value={params.workspace.backgroundColor}
        >
          <div className="space-y-3">
            {renderCompactWorkspacePaletteGrid(params)}
            {renderCompactWorkspaceDefaultAction(params)}
          </div>
        </CompactCommandField>
      ),
    },
  ];
}

export function buildGridCompactCommands(params: InspectorCommandParams): CompactCommand[] {
  const styleCommands = buildGridStyleCommands(params);

  return [
    ...buildGridToggleCompactCommands(params),
    ...styleCommands,
    {
      id: 'grid-presets',
      icon: 'preset',
      title: translate('editor.compact.neutralPresets'),
      trigger: <CompactCommandToken>PRE</CompactCommandToken>,
      value: params.workspace.gridColor,
      content: (
        <CompactCommandField
          label={translate('editor.compact.neutralPresets')}
          value={params.workspace.gridColor}
        >
          <div className="grid grid-cols-4 gap-2">{buildGridPaletteButtons(params)}</div>
        </CompactCommandField>
      ),
    },
  ];
}

export function buildMetaCompactCommands(
  controller: Pick<ImageEditorController, 'insertTechnicalData'>
): CompactCommand[] {
  return [
    {
      id: 'meta-technical-data',
      icon: 'text',
      title: translate('editor.compact.technicalData'),
      trigger: <CompactCommandToken>TXT</CompactCommandToken>,
      content: (
        <CompactCommandField label={translate('editor.compact.technicalData')}>
          <EditorTechnicalDataPicker
            variant="compact"
            onInsert={(kinds, layout) => controller.insertTechnicalData(kinds, layout)}
          />
        </CompactCommandField>
      ),
    },
  ];
}

export function buildSelectionActionCommands(
  _params: Pick<InspectorCommandParams, 'canDeleteSelection' | 'selection'>,
  _controller: Pick<ImageEditorController, 'deleteSelection' | 'duplicateSelection'>
): CompactCommand[] {
  return [];
}
