import {
  BrushCleaning,
  Droplet,
  Highlighter,
  MousePointer2,
  Pencil,
  Shapes,
  Type,
  ArrowUpRight,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import type { ContentDrawingController } from '../../../drawing/controller';
import { useDrawingSessionSnapshot } from '../../../drawing/controller';
import type { DrawingTool } from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { resolveDrawingQuickOptionsTool, ToolbarDrawingOptions } from './drawing-options';

type DrawingToolDescriptor = {
  tool: DrawingTool;
  icon: typeof Pencil;
  label: Parameters<typeof translate>[0];
  modifierHint?: Parameters<typeof translate>[0];
};

const tools: readonly DrawingToolDescriptor[] = [
  {
    tool: 'select',
    icon: MousePointer2,
    label: 'content.toolbar.drawingSelect',
    modifierHint: 'content.toolbar.drawingSelectModifierHint',
  },
  {
    tool: 'pencil',
    icon: Pencil,
    label: 'content.toolbar.drawingPencil',
    modifierHint: 'content.toolbar.drawingStrokeModifierHint',
  },
  {
    tool: 'marker',
    icon: Highlighter,
    label: 'content.toolbar.drawingMarker',
    modifierHint: 'content.toolbar.drawingStrokeModifierHint',
  },
  {
    tool: 'text',
    icon: Type,
    label: 'content.toolbar.drawingText',
    modifierHint: 'content.toolbar.drawingTextModifierHint',
  },
  {
    tool: 'shape',
    icon: Shapes,
    label: 'content.toolbar.drawingShape',
    modifierHint: 'content.toolbar.drawingShapeModifierHint',
  },
  {
    tool: 'arrow',
    icon: ArrowUpRight,
    label: 'content.toolbar.drawingArrow',
    modifierHint: 'content.toolbar.drawingArrowModifierHint',
  },
  { tool: 'blur', icon: Droplet, label: 'content.toolbar.drawingBlur' },
];

function DrawingToolControl(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  icon: typeof Pencil;
  label: DrawingToolDescriptor['label'];
  modifierHint: DrawingToolDescriptor['modifierHint'];
  optionsTool: ReturnType<typeof resolveDrawingQuickOptionsTool>;
  onActivateTool: () => void;
  onToggleOptions: () => void;
  showOptions: boolean;
  snapshot: ReturnType<typeof useDrawingSessionSnapshot>;
  tool: DrawingTool;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modifierHintId = useId();
  const Icon = props.icon;
  const label = translate(props.label);
  const modifierHint = props.modifierHint ? translate(props.modifierHint) : null;
  const title = modifierHint ? `${label}\n${modifierHint}` : label;
  return (
    <div className="relative flex">
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        active={props.snapshot.activeTool === props.tool}
        aria-pressed={props.snapshot.activeTool === props.tool}
        aria-label={label}
        aria-describedby={modifierHint ? modifierHintId : undefined}
        title={title}
        dataUi={`content.toolbar.drawing.${props.tool}`}
        onClick={() => {
          if (props.snapshot.activeTool === props.tool && props.tool !== 'select') {
            props.onToggleOptions();
            return;
          }
          if (props.snapshot.activeTool !== props.tool) {
            props.controller.finalizeInteraction();
            props.onActivateTool();
          }
          props.controller.session.setActiveTool(props.tool);
        }}
      >
        <Icon size={18} />
      </ContentToolbarButton>
      {modifierHint ? (
        <span id={modifierHintId} className="sr-only">
          {modifierHint}
        </span>
      ) : null}
      {props.optionsTool && props.showOptions ? (
        <ToolbarDrawingOptions
          controller={props.controller}
          displayMode={props.displayMode}
          snapshot={props.snapshot}
          tool={props.optionsTool}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}

export function ToolbarDrawingControls(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
}) {
  const { controller } = props;
  const snapshot = useDrawingSessionSnapshot(controller.session);
  const [collapsedOptionsTool, setCollapsedOptionsTool] = useState<DrawingTool | null>(null);
  const optionsTool = resolveDrawingQuickOptionsTool(snapshot);
  const optionsAnchorTool =
    snapshot.activeTool === 'select' && snapshot.selectedObjectIds.length > 0
      ? 'select'
      : optionsTool;
  return (
    <>
      <ContentToolbarGroup
        aria-label={translate('content.toolbar.drawingTools')}
        dataUi="content.toolbar.drawing-tools-group"
      >
        {tools.map(({ tool, icon, label, modifierHint }) => (
          <DrawingToolControl
            key={tool}
            controller={controller}
            displayMode={props.displayMode}
            icon={icon}
            label={label}
            modifierHint={modifierHint}
            optionsTool={optionsTool}
            showOptions={optionsAnchorTool === tool && collapsedOptionsTool !== tool}
            snapshot={snapshot}
            tool={tool}
            onActivateTool={() => setCollapsedOptionsTool(null)}
            onToggleOptions={() =>
              setCollapsedOptionsTool((current) => (current === tool ? null : tool))
            }
          />
        ))}
      </ContentToolbarGroup>
      <ContentToolbarDivider dataUi="content.toolbar.drawing-actions-divider" />
      <ContentToolbarGroup
        aria-label={translate('content.toolbar.drawingActions')}
        dataUi="content.toolbar.drawing-actions-group"
      >
        <ContentToolbarButton
          type="button"
          tone="danger"
          disabled={snapshot.document.objects.length === 0}
          aria-label={translate('content.toolbar.drawingClear')}
          title={translate('content.toolbar.drawingClear')}
          onClick={() => controller.session.clear()}
        >
          <BrushCleaning size={18} strokeWidth={2} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
    </>
  );
}
