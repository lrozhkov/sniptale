import { translate } from '../../../../../platform/i18n';

import { HeaderValueToggleSection } from '../../../environment/shared';
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

function getGridToggleValue(active: boolean): string {
  return active
    ? translate('editor.compact.enabledShort')
    : translate('editor.compact.disabledShort');
}

function getNextGridToggleValue(active: boolean): 'enabled' | 'disabled' {
  return active ? 'disabled' : 'enabled';
}

function GridToggleSection(props: GridToggleConfig) {
  return (
    <HeaderValueToggleSection
      active={props.active}
      ariaLabel={props.active ? props.activeLabel : props.inactiveLabel}
      label={props.label}
      nextValue={getNextGridToggleValue(props.active)}
      value={getGridToggleValue(props.active)}
      onChange={props.onToggle}
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
