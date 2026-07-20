import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { InspectorShellFrame, InspectorShellPanel } from '@sniptale/ui/inspector-shell';
import { SelectedElementInspector } from './element';
import { SCENARIO_INSPECTOR_WIDTH_CLASS_NAME } from './layout';
import { ScenarioLayersInspector } from './layers';
import { SlideInspector } from './slide';
import { ScenarioExportToolInspector } from './tool-export';
import { ScenarioGridToolInspector } from './tool-grid';
import type { ScenarioInspectorProps, ScenarioInspectorTool } from './types';

function findSelectedElement(elements: ScenarioElement[], selectedElementId: string | null) {
  return selectedElementId
    ? (elements.find((element) => element.id === selectedElementId) ?? null)
    : null;
}

export function ScenarioInspectorPanel(props: ScenarioInspectorProps) {
  const selectedElement = findSelectedElement(props.elements, props.selectedElementId);
  const content = (
    <InspectorShellPanel className="flex min-h-0 flex-col overflow-hidden">
      <div
        data-ui="scenario.inspector.parameters"
        className={[
          'min-h-0 overflow-y-auto overflow-x-hidden px-2.5 pb-5 pt-3',
          props.hideLayers ? 'flex-1' : 'max-h-[52%] shrink-0',
        ].join(' ')}
      >
        <ScenarioInspectorParameterBody inspectorProps={props} selectedElement={selectedElement} />
      </div>
      {props.hideLayers ? null : <ScenarioLayersInspector {...props} />}
    </InspectorShellPanel>
  );

  if (props.embedded) {
    return (
      <div data-ui="scenario.inspector.panel" className="flex min-h-0 flex-1 overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <InspectorShellFrame
      dataUi="scenario.inspector.panel"
      expandedWidthClassName={SCENARIO_INSPECTOR_WIDTH_CLASS_NAME}
      className="h-full"
    >
      {content}
    </InspectorShellFrame>
  );
}

function ScenarioInspectorParameterBody(props: {
  inspectorProps: ScenarioInspectorProps;
  selectedElement: ScenarioElement | null;
}) {
  if (props.inspectorProps.activeTool) {
    return (
      <ScenarioInspectorToolBody
        activeTool={props.inspectorProps.activeTool}
        props={props.inspectorProps}
      />
    );
  }

  if (props.selectedElement) {
    return <ElementParameters {...props} />;
  }

  return props.inspectorProps.slide && props.inspectorProps.onUpdateSlide ? (
    <SlideInspector
      slide={props.inspectorProps.slide}
      {...(props.inspectorProps.onUpdatePresentation
        ? { onUpdatePresentation: props.inspectorProps.onUpdatePresentation }
        : {})}
      {...(props.inspectorProps.presentation
        ? { presentation: props.inspectorProps.presentation }
        : {})}
      onUpdateSlide={props.inspectorProps.onUpdateSlide}
    />
  ) : (
    <InspectorEmptyState label={translate('scenario.editor.selectSlide')} />
  );
}

function ScenarioInspectorToolBody(args: {
  activeTool: ScenarioInspectorTool;
  props: ScenarioInspectorProps;
}) {
  if (args.activeTool === 'grid') {
    return args.props.canvasControls ? (
      <ScenarioGridToolInspector controls={args.props.canvasControls} />
    ) : (
      <InspectorEmptyState label={translate('scenario.editor.toggleGrid')} />
    );
  }

  return args.props.exportCommand ? (
    <ScenarioExportToolInspector command={args.props.exportCommand} />
  ) : (
    <InspectorEmptyState label={translate('scenario.editor.export')} />
  );
}

function ElementParameters(props: {
  inspectorProps: ScenarioInspectorProps;
  selectedElement: ScenarioElement | null;
}) {
  if (!props.selectedElement) {
    return <InspectorEmptyState label={translate('scenario.editor.selectLayer')} />;
  }
  const selectedElement = props.selectedElement;

  return (
    <SelectedElementInspector
      element={selectedElement}
      {...(props.inspectorProps.onEditImageElement
        ? { onEditImageElement: props.inspectorProps.onEditImageElement }
        : {})}
      onUpdateElement={(patch) => props.inspectorProps.onUpdateElement(selectedElement.id, patch)}
    />
  );
}

function InspectorEmptyState(props: { label: string }) {
  return (
    <div
      className="rounded-[12px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)]
        px-4 py-5 text-center text-sm text-[var(--sniptale-color-text-muted)]"
    >
      {props.label}
    </div>
  );
}
