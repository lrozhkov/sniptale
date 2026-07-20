import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  EyeOff,
  Image,
  ImagePlus,
  Lock,
  MessageSquare,
  Minus,
  Square,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { ProductLayerList, type ProductLayerListItem } from './layer-list';
import { cx } from '../../ui/compact-inspector-controls';
import { getElementKindLabelKey } from './labels';
import type { ScenarioInspectorElementPatch, ScenarioInspectorProps } from './types';

type ScenarioLayerActions = {
  onDeleteElement: (elementId: string) => void;
  onMoveElement: (elementId: string, direction: 'backward' | 'forward') => void;
  onSelectElement: (elementId: string) => void;
  onUpdateElement: (elementId: string, patch: ScenarioInspectorElementPatch) => void;
};

export function ScenarioLayersInspector(props: ScenarioInspectorProps) {
  const [expanded, setExpanded] = useState(true);
  const collapsible = props.layersCollapsible ?? true;
  const contentVisible = !collapsible || expanded;

  return (
    <div
      data-ui="scenario.inspector.layers-dock"
      className={cx(
        'flex min-h-0 flex-col overflow-hidden',
        collapsible && 'border-t border-[var(--sniptale-color-border-soft)]',
        contentVisible ? 'flex-1' : 'h-14 shrink-0'
      )}
    >
      <ScenarioLayersHeader
        collapsible={collapsible}
        expanded={contentVisible}
        layerCount={props.elements.length}
        {...(props.onInsertImageFile ? { onInsertImageFile: props.onInsertImageFile } : {})}
        onToggle={() => setExpanded((current) => !current)}
      />
      {contentVisible ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-4 pt-2.5">
          <ScenarioLayerList
            elements={props.elements}
            onDeleteElement={props.onDeleteElement}
            onMoveElement={props.onMoveElement}
            onSelectElement={props.onSelectElement}
            onUpdateElement={props.onUpdateElement}
            selectedElementId={props.selectedElementId}
          />
        </div>
      ) : null}
    </div>
  );
}

function ScenarioLayersHeader(props: {
  collapsible: boolean;
  expanded: boolean;
  layerCount: number;
  onInsertImageFile?: (file?: File) => Promise<void> | void;
  onToggle: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between px-2 pr-3">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 px-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('scenario.editor.layers')}
          </span>
          <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
            {props.layerCount} {translate('scenario.editor.layerCountSuffix')}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {props.onInsertImageFile ? (
          <ScenarioLayerInsertImageControl onInsertImageFile={props.onInsertImageFile} />
        ) : null}
        {props.collapsible ? (
          <EditorIconButton title={translate('scenario.editor.layers')} onClick={props.onToggle}>
            {props.expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </EditorIconButton>
        ) : null}
      </div>
    </div>
  );
}

function ScenarioLayerInsertImageControl(props: {
  onInsertImageFile: (file?: File) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const label = translate('scenario.editor.insertImage');

  return (
    <>
      <EditorIconButton title={label} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="h-4 w-4" />
      </EditorIconButton>
      <input
        ref={inputRef}
        accept="image/*"
        className="sr-only"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          if (file) {
            void props.onInsertImageFile(file);
          }
        }}
      />
    </>
  );
}

function ScenarioLayerList(props: {
  elements: ScenarioElement[];
  onDeleteElement: ScenarioLayerActions['onDeleteElement'];
  onMoveElement: ScenarioLayerActions['onMoveElement'];
  onSelectElement: ScenarioLayerActions['onSelectElement'];
  onUpdateElement: ScenarioLayerActions['onUpdateElement'];
  selectedElementId: string | null;
}) {
  const actions: ScenarioLayerActions = {
    onDeleteElement: props.onDeleteElement,
    onMoveElement: props.onMoveElement,
    onSelectElement: props.onSelectElement,
    onUpdateElement: props.onUpdateElement,
  };
  const items = props.elements
    .slice()
    .reverse()
    .map((element) =>
      createScenarioLayerListItem({
        actions,
        element,
        selected: element.id === props.selectedElementId,
      })
    );

  return (
    <ProductLayerList
      dataUi="scenario.inspector.layers"
      emptyLabel={translate('scenario.editor.noLayers')}
      items={items}
      onSelectItem={props.onSelectElement}
    />
  );
}

function createScenarioLayerListItem(props: {
  actions: ScenarioLayerActions;
  element: ScenarioElement;
  selected: boolean;
}): ProductLayerListItem {
  const { actions, element } = props;

  return {
    id: element.id,
    title: element.name,
    meta: translate(getElementKindLabelKey(element.kind)),
    selected: props.selected,
    preview: getLayerPreviewIcon(element),
    actions: createScenarioLayerActions(element, actions),
  };
}

function createScenarioLayerActions(
  element: ScenarioElement,
  actions: ScenarioLayerActions
): ProductLayerListItem['actions'] {
  return [
    {
      icon: <ArrowUp size={13} strokeWidth={2} />,
      label: translate('scenario.editor.moveLayerForward'),
      onClick: () => actions.onMoveElement(element.id, 'forward'),
    },
    {
      icon: <ArrowDown size={13} strokeWidth={2} />,
      label: translate('scenario.editor.moveLayerBackward'),
      onClick: () => actions.onMoveElement(element.id, 'backward'),
    },
    createVisibilityAction(element, actions),
    createLockAction(element, actions),
    {
      destructive: true,
      icon: <Trash2 size={13} strokeWidth={2} />,
      label: translate('scenario.editor.deleteLayer'),
      onClick: () => actions.onDeleteElement(element.id),
    },
  ];
}

function createVisibilityAction(
  element: ScenarioElement,
  actions: ScenarioLayerActions
): ProductLayerListItem['actions'][number] {
  return {
    active: element.visible,
    icon: element.visible ? (
      <Eye size={13} strokeWidth={2} />
    ) : (
      <EyeOff size={13} strokeWidth={2} />
    ),
    label: translate(element.visible ? 'scenario.editor.hideLayer' : 'scenario.editor.showLayer'),
    onClick: () => actions.onUpdateElement(element.id, { visible: !element.visible }),
  };
}

function createLockAction(
  element: ScenarioElement,
  actions: ScenarioLayerActions
): ProductLayerListItem['actions'][number] {
  return {
    active: element.locked,
    icon: element.locked ? (
      <Lock size={13} strokeWidth={2} />
    ) : (
      <Unlock size={13} strokeWidth={2} />
    ),
    label: translate(element.locked ? 'scenario.editor.unlockLayer' : 'scenario.editor.lockLayer'),
    onClick: () => actions.onUpdateElement(element.id, { locked: !element.locked }),
  };
}

function getLayerPreviewIcon(element: ScenarioElement): ReactNode {
  switch (element.kind) {
    case 'arrow':
      return <ArrowRight size={15} strokeWidth={2} />;
    case 'callout':
      return <MessageSquare size={15} strokeWidth={2} />;
    case 'code':
      return <Code2 size={15} strokeWidth={2} />;
    case 'image':
      return <Image size={15} strokeWidth={2} />;
    case 'line':
      return <Minus size={15} strokeWidth={2} />;
    case 'shape':
      return <Square size={15} strokeWidth={2} />;
    case 'text':
      return <Type size={15} strokeWidth={2} />;
  }
}
