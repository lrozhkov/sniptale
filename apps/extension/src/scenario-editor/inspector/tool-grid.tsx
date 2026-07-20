import { Crosshair, Grid2X2, Magnet, Map } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { OptionRow, StatusRow } from '../../ui/compact-inspector-controls';
import type { ScenarioCanvasViewportControls } from '../canvas/viewport-state';
import { InspectorSection } from './fields';

export function ScenarioGridToolInspector(props: { controls: ScenarioCanvasViewportControls }) {
  return (
    <div className="grid gap-5" data-ui="scenario.inspector.grid-tool">
      <InspectorSection title={translate('scenario.editor.toggleGrid')}>
        <GridToggleRow
          checked={props.controls.gridVisible}
          icon={<Grid2X2 className="h-4 w-4" />}
          label={translate('scenario.editor.toggleGrid')}
          onChange={props.controls.onSetGridVisible}
        />
        <GridToggleRow
          checked={props.controls.snapToGrid}
          icon={<Crosshair className="h-4 w-4" />}
          label={translate('scenario.editor.toggleSnapToGrid')}
          onChange={props.controls.onSetSnapToGrid}
        />
        <GridToggleRow
          checked={props.controls.magnetEnabled}
          icon={<Magnet className="h-4 w-4" />}
          label={translate('scenario.editor.toggleMagnet')}
          onChange={props.controls.onSetMagnetEnabled}
        />
        {props.controls.onSetNavigatorVisible ? (
          <GridToggleRow
            checked={props.controls.navigatorVisible ?? false}
            icon={<Map className="h-4 w-4" />}
            label={translate('scenario.editor.toggleNavigator')}
            onChange={props.controls.onSetNavigatorVisible}
          />
        ) : null}
      </InspectorSection>
      <InspectorSection title={translate('scenario.editor.zoomCurrentPrefix')}>
        <StatusRow
          label={translate('scenario.editor.zoomCurrentPrefix')}
          value={<ValueBadge>{Math.round(props.controls.scale * 100)}%</ValueBadge>}
        />
      </InspectorSection>
    </div>
  );
}

function GridToggleRow(props: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <OptionRow
      active={props.checked}
      label={
        <span className="flex items-center gap-2">
          <span className="text-[var(--sniptale-color-text-muted)]">{props.icon}</span>
          <span>{props.label}</span>
        </span>
      }
      onToggle={() => props.onChange(!props.checked)}
    />
  );
}
