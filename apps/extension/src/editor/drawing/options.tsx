import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  DRAWING_ARROW_WIDTHS,
  DRAWING_MARKER_WIDTHS,
  DRAWING_OUTLINE_WIDTHS,
  DRAWING_PENCIL_WIDTHS,
  type DrawingToolDefaults,
} from '../../features/drawing/public';
import {
  createDefaultDrawingPaletteState,
  loadDrawingPaletteState,
  subscribeToDrawingPaletteState,
} from '../../composition/persistence/drawing-palette';
import {
  ArrowWidthModeOptions,
  DrawingColorOptions,
  DrawingDeleteOption,
  DrawingDeselectOption,
  DrawingOptionsDivider,
  DrawingShapeFillOptions,
  DrawingShapeOptions,
  DrawingTextOptions,
  DrawingWidthOptions,
  MarkerOpacityOptions,
} from '../../ui/drawing-tools/options';
import { translate } from '../../platform/i18n';
import { useEditorStore } from '../state/useEditorStore';

type ConfigurableTool = keyof DrawingToolDefaults;
type DrawingOptionsTool = ConfigurableTool | 'blur';
type DrawingSettingsUpdate = <Tool extends ConfigurableTool>(
  tool: Tool,
  patch: Partial<DrawingToolDefaults[Tool]>
) => void;
type DrawingColorContext = {
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'side';
  vertical: true;
};

function useDrawingPalette() {
  const [colors, setColors] = useState<readonly string[]>(
    () => createDefaultDrawingPaletteState().colors
  );
  useEffect(() => {
    let active = true;
    void loadDrawingPaletteState().then((state) => {
      if (active) setColors(state.colors);
    });
    const unsubscribe = subscribeToDrawingPaletteState((state) => setColors(state.colors));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return colors;
}

function PencilOptions(props: {
  settings: DrawingToolDefaults['pencil'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingWidthOptions
        tool="pencil"
        value={props.settings.width}
        values={DRAWING_PENCIL_WIDTHS}
        onChange={(width) => props.update('pencil', { width })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingColorOptions
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('pencil', { color })}
      />
    </>
  );
}

function MarkerOptions(props: {
  settings: DrawingToolDefaults['marker'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingWidthOptions
        tool="marker"
        value={props.settings.width}
        values={DRAWING_MARKER_WIDTHS}
        onChange={(width) => props.update('marker', { width })}
      />
      <DrawingOptionsDivider vertical />
      <MarkerOpacityOptions
        value={props.settings.opacity}
        onChange={(opacity) => props.update('marker', { opacity })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingColorOptions
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('marker', { color })}
      />
    </>
  );
}

function ShapeOptions(props: {
  settings: DrawingToolDefaults['shape'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingShapeOptions
        value={props.settings.kind}
        onChange={(kind) => props.update('shape', { kind })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingWidthOptions
        tool="shape"
        value={props.settings.width}
        values={DRAWING_OUTLINE_WIDTHS}
        onChange={(width) => props.update('shape', { width })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingColorOptions
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('shape', { color })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingShapeFillOptions
        {...props.common}
        value={props.settings.fillColor}
        onChange={(fillColor) => props.update('shape', { fillColor })}
      />
    </>
  );
}

function ArrowOptions(props: {
  settings: DrawingToolDefaults['arrow'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
}) {
  return (
    <>
      <ArrowWidthModeOptions
        design={props.settings.design}
        dynamic={props.settings.dynamicWidth}
        onChange={(patch) => props.update('arrow', patch)}
      />
      <DrawingOptionsDivider vertical />
      <DrawingWidthOptions
        tool="arrow"
        value={props.settings.width}
        values={DRAWING_ARROW_WIDTHS}
        onChange={(width) => props.update('arrow', { width })}
      />
      <DrawingOptionsDivider vertical />
      <DrawingColorOptions
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('arrow', { color })}
      />
    </>
  );
}

function ToolOptions(props: {
  common: DrawingColorContext;
  settings: DrawingToolDefaults;
  tool: DrawingOptionsTool;
  update: DrawingSettingsUpdate;
}) {
  switch (props.tool) {
    case 'pencil':
      return (
        <PencilOptions
          common={props.common}
          settings={props.settings.pencil}
          update={props.update}
        />
      );
    case 'marker':
      return (
        <MarkerOptions
          common={props.common}
          settings={props.settings.marker}
          update={props.update}
        />
      );
    case 'shape':
      return (
        <ShapeOptions common={props.common} settings={props.settings.shape} update={props.update} />
      );
    case 'arrow':
      return (
        <ArrowOptions common={props.common} settings={props.settings.arrow} update={props.update} />
      );
    case 'text':
      return (
        <DrawingTextOptions
          {...props.common}
          {...props.settings.text}
          onBackgroundColorChange={(backgroundColor) => props.update('text', { backgroundColor })}
          onColorChange={(color) => props.update('text', { color })}
          onFontFamilyChange={(fontFamily) => props.update('text', { fontFamily })}
          onFontSizeChange={(fontSize) => props.update('text', { fontSize })}
        />
      );
    case 'blur':
      return null;
  }
}

export function EditorDrawingOptions(props: {
  onApplyToSelection: () => void;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  selectedType: string | null | undefined;
  tool: DrawingOptionsTool;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const colors = useDrawingPalette();
  const toolSettings = useEditorStore((state) => state.toolSettings);
  const selectionToolSettings = useEditorStore((state) => state.selectionToolSettings);
  const selected =
    props.selectedType === props.tool || (props.tool === 'shape' && props.selectedType === 'shape');
  const values = selected ? selectionToolSettings : toolSettings;

  const update = <Tool extends ConfigurableTool>(
    tool: Tool,
    patch: Partial<DrawingToolDefaults[Tool]>
  ) => {
    const store = useEditorStore.getState();
    store.updateDrawingToolSettings(tool, patch);
    if (selected) {
      store.updateSelectionDrawingToolSettings(tool, patch);
      props.onApplyToSelection();
    }
  };

  const common = {
    colors,
    floatingBoundaryRef: panelRef,
    floatingPlacement: 'side' as const,
    vertical: true as const,
  };

  return (
    <div
      ref={panelRef}
      data-ui="editor.drawing.options"
      className="flex flex-col items-center gap-2 p-2"
    >
      <ToolOptions common={common} settings={values} tool={props.tool} update={update} />
      {selected ? (
        <>
          {props.tool === 'blur' ? null : <DrawingOptionsDivider vertical />}
          <DrawingDeselectOption onClick={props.onClearSelection} />
          <DrawingDeleteOption onClick={props.onDeleteSelection} />
        </>
      ) : null}
    </div>
  );
}
