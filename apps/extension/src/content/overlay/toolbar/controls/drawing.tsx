import {
  Circle,
  Eraser,
  Highlighter,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  TextCursorInput,
  Trash2,
  Undo2,
  ArrowUpRight,
} from 'lucide-react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import type { ContentDrawingController } from '../../../drawing/controller';
import { useDrawingSessionSnapshot } from '../../../drawing/controller';
import type { DrawingTool } from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { ToolbarDrawingOptions } from './drawing-options';

const tools: readonly { tool: DrawingTool; icon: typeof Pencil; label: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'content.toolbar.drawingSelect' },
  { tool: 'pencil', icon: Pencil, label: 'content.toolbar.drawingPencil' },
  { tool: 'marker', icon: Highlighter, label: 'content.toolbar.drawingMarker' },
  { tool: 'rectangle', icon: Square, label: 'content.toolbar.drawingRectangle' },
  { tool: 'ellipse', icon: Circle, label: 'content.toolbar.drawingEllipse' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'content.toolbar.drawingArrow' },
  { tool: 'blur', icon: Eraser, label: 'content.toolbar.drawingBlur' },
  { tool: 'text', icon: TextCursorInput, label: 'content.toolbar.drawingText' },
];

export function ToolbarDrawingControls(props: { controller: ContentDrawingController }) {
  const { controller } = props;
  const snapshot = useDrawingSessionSnapshot(controller.session);
  return (
    <>
      <ContentToolbarDivider />
      <ContentToolbarGroup aria-label={translate('content.toolbar.drawingTools')}>
        {tools.map(({ tool, icon: Icon, label }) => (
          <ContentToolbarButton
            key={tool}
            type="button"
            active={snapshot.activeTool === tool}
            aria-pressed={snapshot.activeTool === tool}
            aria-label={translate(label as Parameters<typeof translate>[0])}
            title={translate(label as Parameters<typeof translate>[0])}
            dataUi={`content.toolbar.drawing.${tool}`}
            onClick={() => controller.session.setActiveTool(tool)}
          >
            <Icon size={18} />
          </ContentToolbarButton>
        ))}
      </ContentToolbarGroup>
      <ContentToolbarDivider />
      <ToolbarDrawingOptions controller={controller} snapshot={snapshot} />
      <ContentToolbarDivider />
      <ContentToolbarGroup aria-label={translate('content.toolbar.drawingHistory')}>
        <ContentToolbarButton
          type="button"
          disabled={!snapshot.canUndo}
          aria-label={translate('content.toolbar.drawingUndo')}
          title={translate('content.toolbar.drawingUndo')}
          onClick={() => controller.session.undo()}
        >
          <Undo2 size={18} />
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
          disabled={!snapshot.canRedo}
          aria-label={translate('content.toolbar.drawingRedo')}
          title={translate('content.toolbar.drawingRedo')}
          onClick={() => controller.session.redo()}
        >
          <Redo2 size={18} />
        </ContentToolbarButton>
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
          <Eraser size={18} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
    </>
  );
}
