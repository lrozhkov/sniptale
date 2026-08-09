import {
  BrushCleaning,
  Droplet,
  Highlighter,
  MousePointer2,
  Pencil,
  Shapes,
  Type,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { useRef } from 'react';
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

const tools: readonly { tool: DrawingTool; icon: typeof Pencil; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'content.toolbar.drawingSelect' },
  { tool: 'pencil', icon: Pencil, label: 'content.toolbar.drawingPencil' },
  { tool: 'marker', icon: Highlighter, label: 'content.toolbar.drawingMarker' },
  { tool: 'shape', icon: Shapes, label: 'content.toolbar.drawingShape' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'content.toolbar.drawingArrow' },
  { tool: 'blur', icon: Droplet, label: 'content.toolbar.drawingBlur' },
  { tool: 'text', icon: Type, label: 'content.toolbar.drawingText' },
];

function DrawingToolControl(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  icon: typeof Pencil;
  label: string;
  optionsTool: ReturnType<typeof resolveDrawingQuickOptionsTool>;
  showOptions: boolean;
  snapshot: ReturnType<typeof useDrawingSessionSnapshot>;
  tool: DrawingTool;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const Icon = props.icon;
  return (
    <div className="relative flex">
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        active={props.snapshot.activeTool === props.tool}
        aria-pressed={props.snapshot.activeTool === props.tool}
        aria-label={translate(props.label as Parameters<typeof translate>[0])}
        title={translate(props.label as Parameters<typeof translate>[0])}
        dataUi={`content.toolbar.drawing.${props.tool}`}
        onClick={() => props.controller.session.setActiveTool(props.tool)}
      >
        <Icon size={18} />
      </ContentToolbarButton>
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
  const optionsTool = resolveDrawingQuickOptionsTool(snapshot);
  const optionsAnchorTool =
    snapshot.activeTool === 'select' && snapshot.selectedObjectId ? 'select' : optionsTool;
  return (
    <>
      <ContentToolbarGroup
        aria-label={translate('content.toolbar.drawingTools')}
        dataUi="content.toolbar.drawing-tools-group"
      >
        {tools.map(({ tool, icon, label }) => (
          <DrawingToolControl
            key={tool}
            controller={controller}
            displayMode={props.displayMode}
            icon={icon}
            label={label}
            optionsTool={optionsTool}
            showOptions={optionsAnchorTool === tool}
            snapshot={snapshot}
            tool={tool}
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
          disabled={!snapshot.selectedObjectId}
          aria-label={translate('content.toolbar.drawingDelete')}
          title={translate('content.toolbar.drawingDelete')}
          onClick={() => controller.session.deleteSelected()}
        >
          <Trash2 size={18} />
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
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
