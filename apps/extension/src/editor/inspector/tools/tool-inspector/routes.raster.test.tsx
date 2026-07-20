/* eslint-disable max-lines-per-function --
   exact route coverage keeps raster and adjacent tool branches in one owner-local proof */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { useEditorStore } from '../../../state/useEditorStore';
import { createToolsPanelProps } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderToolInspector } from './routes/render';

describe('tool-inspector/routes raster tools', () => {
  beforeEach(() => {
    useEditorStore.setState({
      rasterToolSettings: {
        brushColor: '#ea580c',
        brushHardness: 0.85,
        brushOpacity: 1,
        brushSize: 24,
        selectionMode: 'marquee',
        eraserSize: 28,
        fillMode: 'bucket',
        fillColor: '#111827',
        gradientFrom: '#111827',
        gradientTo: '#ffffff',
      },
      rasterSelection: {
        hasSelection: false,
        targetLayerId: null,
        targetLayerName: null,
      },
    });
  });

  function createRouteController() {
    return {
      applyCropSelection: async () => undefined,
      cancelCropMode: () => undefined,
      insertRichShape: () => undefined,
      resizeLayer: () => undefined,
    };
  }

  it('renders dedicated selection, brush, eraser, and fill panels', () => {
    const controller = createRouteController();

    expect(
      renderToStaticMarkup(renderToolInspector(controller, 'selection', {} as never))
    ).toContain(translate('editor.sidebar.rasterSelectionMode'));
    expect(renderToStaticMarkup(renderToolInspector(controller, 'brush', {} as never))).toContain(
      translate('editor.sidebar.rasterBrushSize')
    );
    expect(renderToStaticMarkup(renderToolInspector(controller, 'eraser', {} as never))).toContain(
      translate('editor.sidebar.rasterEraserSize')
    );
    expect(renderToStaticMarkup(renderToolInspector(controller, 'fill', {} as never))).toContain(
      translate('editor.sidebar.rasterFillMode')
    );
  });

  it.each([
    ['select', createToolsPanelProps({ highlightedTool: 'select' }), 'Состояние'],
    ['image', createToolsPanelProps({ highlightedTool: 'image' }), 'Состояние'],
    ['pencil', createToolsPanelProps({ highlightedTool: 'pencil' }), 'Толщина'],
    ['rectangle', createToolsPanelProps({ highlightedTool: 'rectangle' }), 'Цвет линии'],
    ['blur', createToolsPanelProps({ highlightedTool: 'blur' }), 'Эффект'],
    ['arrow', createToolsPanelProps({ highlightedTool: 'arrow' }), 'Тип стрелки'],
    ['step', createToolsPanelProps({ highlightedTool: 'step' }), 'Тип'],
  ] as const)('keeps %s route available after raster additions', (tool, props, expected) => {
    const controller = createRouteController();

    expect(renderToStaticMarkup(renderToolInspector(controller, tool, props as never))).toContain(
      expected
    );
  });

  it('keeps existing tool routes available alongside raster additions', () => {
    const controller = createRouteController();
    const cropProps = createToolsPanelProps({ highlightedTool: 'crop' });
    const textProps = createToolsPanelProps({ highlightedTool: 'text' });

    expect(
      renderToStaticMarkup(renderToolInspector(controller, 'crop', cropProps as never))
    ).toContain('Применить');
    expect(
      renderToStaticMarkup(renderToolInspector(controller, 'text', textProps as never))
    ).toContain('Шрифт');
  });
});
