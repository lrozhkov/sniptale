import { PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useState } from 'react';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import { translate } from '../../../platform/i18n';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import {
  FloatingChromePanel,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import type { ScenarioCanvasViewportController } from '../../canvas/viewport-state';
import { ScenarioLayersInspector } from '../../inspector/layers';
import { ScenarioSlideRail } from '../slide-rail';
import { ScenarioEditorInspectorPanelBridge } from '../scenario-inspector-panel-bridge';
import { FloatingPanelSplitHandle, useFloatingPanelSplit } from './panel-split';
import type { ScenarioV3FloatingEditor, ScenarioV3FloatingTemplateState } from './types';

const RIGHT_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute bottom-3 right-3 top-[4.5rem] z-40 flex min-h-0 w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3',
  'max-[980px]:top-[8rem] max-[720px]:hidden'
);

const LEFT_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute bottom-3 left-3 top-[4.5rem] z-40 flex min-h-0 w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-3',
  'max-[1480px]:w-[18rem] max-[720px]:hidden'
);

const PANEL_CLASS_NAME = 'flex min-h-0 flex-col overflow-hidden';
const PANEL_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center gap-3 border-b px-4 py-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

export function ScenarioFloatingPanels(props: {
  assets: ScenarioSlideRenderAssetMap;
  canvasControls: ScenarioCanvasViewportController['controls'];
  editor: ScenarioV3FloatingEditor;
  inspectorHidden?: boolean;
  inspectorTool: 'export' | null;
  templatePickerOpen: boolean;
  templates: ScenarioV3FloatingTemplateState;
  onClearInspectorTool: () => void;
  onEditImageElement: (elementId: string) => void;
  onOpenExport: () => void;
  onToggleTemplatePicker: () => void;
}) {
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const leftSplit = useFloatingPanelSplit();

  return (
    <>
      <ScenarioFloatingLeftStack leftSplit={leftSplit} {...props} />
      {props.inspectorHidden ? null : (
        <ScenarioFloatingRightStack
          inspectorCollapsed={inspectorCollapsed}
          onInspectorCollapsedChange={setInspectorCollapsed}
          {...props}
        />
      )}
    </>
  );
}

function ScenarioFloatingLeftStack(
  props: Parameters<typeof ScenarioFloatingPanels>[0] & {
    leftSplit: ReturnType<typeof useFloatingPanelSplit>;
  }
) {
  return (
    <div data-ui="scenario.floating.left-stack" className={LEFT_STACK_CLASS_NAME}>
      <ScenarioFloatingSlidePanel {...props} />
      <FloatingPanelSplitHandle
        label={translate('scenario.editor.layers')}
        onKeyStep={props.leftSplit.stepResize}
        onPointerDown={props.leftSplit.startResize}
        onPointerMove={props.leftSplit.updateResize}
      />
      <ScenarioFloatingLayersPanel {...props} />
    </div>
  );
}

function ScenarioFloatingSlidePanel(props: Parameters<typeof ScenarioFloatingLeftStack>[0]) {
  return (
    <FloatingChromePanel
      dataUi="scenario.floating.slide-panel"
      className={PANEL_CLASS_NAME}
      style={{ flexBasis: `${props.leftSplit.ratio * 100}%` }}
    >
      <ScenarioSlideRail
        assets={props.assets}
        onAddSlide={props.editor.slideActions.addSlide}
        onCreateTemplateSlide={props.templates.createSlide}
        onDeleteSlide={props.editor.slideActions.deleteSlide}
        onDuplicateSlide={props.editor.slideActions.duplicateSlide}
        onMoveSlide={props.editor.slideActions.moveSlide}
        onOpenTemplateManager={props.templates.openManager}
        onSelectSlide={(slideId) => {
          props.onClearInspectorTool();
          props.editor.slideActions.selectSlide(slideId);
        }}
        onToggleTemplatePicker={props.onToggleTemplatePicker}
        selectedSlideId={props.editor.selectedSlide.id}
        slides={props.editor.project.slides}
        templatePickerOpen={props.templatePickerOpen}
        templates={props.templates.templates}
        embedded
      />
    </FloatingChromePanel>
  );
}

function ScenarioFloatingLayersPanel(props: Parameters<typeof ScenarioFloatingLeftStack>[0]) {
  return (
    <FloatingChromePanel
      dataUi="scenario.floating.layers-panel"
      className={floatingChromeClassNames(PANEL_CLASS_NAME, 'flex-1')}
    >
      <ScenarioLayersInspector
        elements={props.editor.elements}
        onDeleteElement={props.editor.elementActions.deleteElement}
        onInsertImageFile={props.editor.elementActions.insertImageFile}
        onMoveElement={props.editor.elementActions.moveElement}
        onSelectElement={(elementId) => {
          props.onClearInspectorTool();
          props.editor.elementActions.selectElement(elementId);
        }}
        onUpdateElement={props.editor.elementActions.updateElement}
        selectedElementId={props.editor.selectedElementId}
        layersCollapsible={false}
      />
    </FloatingChromePanel>
  );
}

function ScenarioFloatingRightStack(
  props: Parameters<typeof ScenarioFloatingPanels>[0] & {
    inspectorCollapsed: boolean;
    onInspectorCollapsedChange: (collapsed: boolean) => void;
  }
) {
  return (
    <div data-ui="scenario.floating.right-stack" className={RIGHT_STACK_CLASS_NAME}>
      {props.inspectorCollapsed ? (
        <ScenarioCollapsedPanelButton
          dataUi="scenario.floating.inspector.expand"
          icon="right"
          title={translate('scenario.editor.inspector')}
          onClick={() => props.onInspectorCollapsedChange(false)}
        />
      ) : (
        <ScenarioFloatingInspectorPanel {...props} />
      )}
    </div>
  );
}

function ScenarioFloatingInspectorPanel(props: Parameters<typeof ScenarioFloatingRightStack>[0]) {
  return (
    <FloatingChromePanel
      dataUi="scenario.floating.inspector-panel"
      className={floatingChromeClassNames(PANEL_CLASS_NAME, 'flex-1')}
    >
      <ScenarioFloatingPanelHeader
        title={resolveInspectorTitle(props.inspectorTool, props.editor.selectedElementId)}
        onCollapse={() => props.onInspectorCollapsedChange(true)}
      />
      <ScenarioEditorInspectorPanelBridge
        canvasControls={props.canvasControls}
        editor={props.editor}
        inspectorTool={props.inspectorTool}
        onClearInspectorTool={props.onClearInspectorTool}
        onEditImageElement={props.onEditImageElement}
        onOpenExport={props.onOpenExport}
        embedded
        hideLayers
      />
    </FloatingChromePanel>
  );
}

function ScenarioFloatingPanelHeader(props: { title: string; onCollapse: () => void }) {
  return (
    <div className={PANEL_HEADER_CLASS_NAME}>
      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.title}
      </div>
      <EditorIconButton
        title={translate('editor.toolbar.collapseInspector')}
        onClick={props.onCollapse}
      >
        <PanelRightClose size={16} strokeWidth={2} />
      </EditorIconButton>
    </div>
  );
}

function ScenarioCollapsedPanelButton(props: {
  dataUi: string;
  icon: 'left' | 'right';
  title: string;
  onClick: () => void;
}) {
  return (
    <FloatingChromeToolbar
      dataUi={props.dataUi}
      className={props.icon === 'right' ? 'self-end' : 'self-start'}
    >
      <EditorIconButton title={props.title} onClick={props.onClick}>
        {props.icon === 'right' ? (
          <PanelRightOpen size={17} strokeWidth={2} />
        ) : (
          <PanelLeftOpen size={17} strokeWidth={2} />
        )}
      </EditorIconButton>
    </FloatingChromeToolbar>
  );
}

function resolveInspectorTitle(inspectorTool: 'export' | null, selectedElementId: string | null) {
  if (inspectorTool === 'export') {
    return translate('scenario.editor.export');
  }
  return selectedElementId
    ? translate('scenario.editor.element')
    : translate('scenario.editor.slide');
}
