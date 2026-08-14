import { translate } from '../../../../../platform/i18n';
import { ProductGlassSwitch, ProductGlassToggleRow } from '@sniptale/ui/product-glass-controls';
import type { GridPanelBodyProps } from '../../types';

type GridToggleSectionsProps = Pick<
  GridPanelBodyProps,
  'gridEnabled' | 'gridSnapEnabled' | 'updateWorkspace'
>;
type GridToggleConfig = {
  active: boolean;
  activeLabel: string;
  id: string;
  inactiveLabel: string;
  label: string;
  onToggle: () => void;
};

function buildGridToggleConfigs(
  gridEnabled: boolean,
  gridSnapEnabled: boolean,
  updateWorkspace: GridToggleSectionsProps['updateWorkspace']
): GridToggleConfig[] {
  return [
    {
      id: 'grid',
      active: gridEnabled,
      label: translate('editor.compact.grid'),
      activeLabel: translate('editor.compact.hideGrid'),
      inactiveLabel: translate('editor.compact.showGrid'),
      onToggle: () => updateWorkspace({ gridEnabled: !gridEnabled }),
    },
    {
      id: 'snap',
      active: gridSnapEnabled,
      label: translate('editor.compact.snap'),
      activeLabel: translate('editor.compact.disableSnap'),
      inactiveLabel: translate('editor.compact.enableSnap'),
      onToggle: () => updateWorkspace({ gridSnapEnabled: !gridSnapEnabled }),
    },
  ];
}

function GridToggleSection(props: GridToggleConfig) {
  return (
    <ProductGlassToggleRow
      title={props.label}
      control={
        <ProductGlassSwitch
          on={props.active}
          aria-label={props.active ? props.activeLabel : props.inactiveLabel}
          aria-pressed={props.active}
          onClick={props.onToggle}
        />
      }
    />
  );
}

export function EditorInspectorGridToggleSections({
  gridEnabled,
  gridSnapEnabled,
  updateWorkspace,
}: GridToggleSectionsProps) {
  const sections = buildGridToggleConfigs(gridEnabled, gridSnapEnabled, updateWorkspace);

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <GridToggleSection key={section.id} {...section} />
      ))}
    </div>
  );
}
