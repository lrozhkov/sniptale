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
  ArrowDrawDirectionOption,
  DrawingColorOptions,
  DrawingBlurStrengthOptions,
  DrawingOptionsDivider,
  DrawingShapeFillOptions,
  DrawingShapeOptions,
  DrawingTextOptions,
  DrawingWidthOptions,
  MarkerOpacityOptions,
} from '../../ui/drawing-tools/options';
import { translate } from '../../platform/i18n';
import { getColorAlpha } from '@sniptale/foundation/color';
import {
  markerColorAtOpacity,
  markerColorPatch,
  markerVisibleColor,
} from '../../ui/drawing-tools/marker-color';
import { useEditorStore } from '../state/useEditorStore';

type ConfigurableTool = keyof DrawingToolDefaults;
type DrawingOptionsTool = ConfigurableTool | 'blur' | 'selection';
type DrawingSettingsUpdate = <Tool extends ConfigurableTool>(
  tool: Tool,
  patch: Partial<DrawingToolDefaults[Tool]>
) => void;
type DrawingColorContext = {
  colors: readonly string[];
  floatingBoundaryRef: RefObject<HTMLElement | null>;
  floatingPlacement: 'auto';
  vertical: false;
};

const EDITOR_DRAWING_OPTIONS_CLASS_NAME = [
  'flex h-7 flex-row items-center gap-2 overflow-x-auto overflow-y-hidden px-1',
  '[&_button:active]:!transform-none [&_button:active]:!translate-y-0',
].join(' ');

function useDrawingPalette() {
  const [colors, setColors] = useState<readonly string[]>(
    () => createDefaultDrawingPaletteState().colors
  );
  useEffect(() => {
    let active = true;
    let observedChange = false;
    void loadDrawingPaletteState().then((state) => {
      if (active && !observedChange) setColors(state.colors);
    });
    const unsubscribe = subscribeToDrawingPaletteState((state) => {
      observedChange = true;
      if (active) setColors(state.colors);
    });
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
  preview: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingColorOptions
        allowAlpha
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('pencil', { color })}
        onPreview={(color) => props.preview('pencil', { color })}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingWidthOptions
        tool="pencil"
        value={props.settings.width}
        values={DRAWING_PENCIL_WIDTHS}
        onChange={(width) => props.update('pencil', { width })}
      />
    </>
  );
}

function MarkerOptions(props: {
  settings: DrawingToolDefaults['marker'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
  preview: DrawingSettingsUpdate;
}) {
  const visibleColor = markerVisibleColor(props.settings.color, props.settings.opacity);
  const previewOriginRef = useRef<{ color: string; opacity: number } | null>(null);
  return (
    <>
      <DrawingColorOptions
        allowAlpha
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={visibleColor}
        onSelect={(color) => {
          previewOriginRef.current = null;
          props.update('marker', markerColorPatch(color));
        }}
        onPreview={(color) => {
          previewOriginRef.current ??= {
            color: props.settings.color,
            opacity: props.settings.opacity,
          };
          props.preview('marker', markerColorPatch(color));
        }}
        onPreviewReset={() => {
          const origin = previewOriginRef.current;
          previewOriginRef.current = null;
          if (origin) props.preview('marker', origin);
        }}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingWidthOptions
        tool="marker"
        value={props.settings.width}
        values={DRAWING_MARKER_WIDTHS}
        onChange={(width) => props.update('marker', { width })}
      />
      <DrawingOptionsDivider vertical={false} />
      <MarkerOpacityOptions
        value={getColorAlpha(visibleColor) ?? 1}
        onChange={(opacity) => props.update('marker', markerColorAtOpacity(visibleColor, opacity))}
      />
    </>
  );
}

function ShapeOptions(props: {
  settings: DrawingToolDefaults['shape'];
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
  preview: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingShapeOptions
        value={props.settings.kind}
        onChange={(kind) => props.update('shape', { kind })}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingWidthOptions
        tool="shape"
        value={props.settings.width}
        values={DRAWING_OUTLINE_WIDTHS}
        onChange={(width) => props.update('shape', { width })}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingColorOptions
        allowAlpha
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('shape', { color })}
        onPreview={(color) => props.preview('shape', { color })}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingShapeFillOptions
        {...props.common}
        value={props.settings.fillColor}
        onChange={(fillColor) => props.update('shape', { fillColor })}
        onPreview={(fillColor) => props.preview('shape', { fillColor })}
      />
    </>
  );
}

function ArrowOptions(props: {
  settings: DrawingToolDefaults['arrow'];
  drawFromTip: boolean;
  onDirectionChange: (value: boolean) => void;
  common: DrawingColorContext;
  update: DrawingSettingsUpdate;
  preview: DrawingSettingsUpdate;
}) {
  return (
    <>
      <DrawingColorOptions
        allowAlpha
        {...props.common}
        label={translate('content.toolbar.drawingColor')}
        value={props.settings.color}
        onSelect={(color) => props.update('arrow', { color })}
        onPreview={(color) => props.preview('arrow', { color })}
      />
      <DrawingOptionsDivider vertical={false} />
      <DrawingWidthOptions
        tool="arrow"
        value={props.settings.width}
        values={DRAWING_ARROW_WIDTHS}
        onChange={(width) => props.update('arrow', { width })}
      />
      <DrawingOptionsDivider vertical={false} />
      <ArrowWidthModeOptions
        design={props.settings.design}
        dynamic={props.settings.dynamicWidth}
        onChange={(patch) => props.update('arrow', patch)}
      />
      <DrawingOptionsDivider vertical={false} />
      <ArrowDrawDirectionOption
        active={props.drawFromTip}
        dataUi="editor.drawing.options.arrow.from-tip"
        onChange={props.onDirectionChange}
      />
    </>
  );
}

function ToolOptions(props: {
  arrowDrawFromTip: boolean;
  onDirectionChange: (value: boolean) => void;
  common: DrawingColorContext;
  settings: DrawingToolDefaults;
  tool: DrawingOptionsTool;
  update: DrawingSettingsUpdate;
  preview: DrawingSettingsUpdate;
}) {
  switch (props.tool) {
    case 'pencil':
      return (
        <PencilOptions
          common={props.common}
          settings={props.settings.pencil}
          update={props.update}
          preview={props.preview}
        />
      );
    case 'marker':
      return (
        <MarkerOptions
          common={props.common}
          settings={props.settings.marker}
          update={props.update}
          preview={props.preview}
        />
      );
    case 'shape':
      return (
        <ShapeOptions
          common={props.common}
          settings={props.settings.shape}
          update={props.update}
          preview={props.preview}
        />
      );
    case 'arrow':
      return (
        <ArrowOptions
          common={props.common}
          drawFromTip={props.arrowDrawFromTip}
          onDirectionChange={props.onDirectionChange}
          settings={props.settings.arrow}
          update={props.update}
          preview={props.preview}
        />
      );
    case 'text':
      return (
        <DrawingTextOptions
          {...props.common}
          {...props.settings.text}
          onBackgroundColorChange={(backgroundColor) => props.update('text', { backgroundColor })}
          onColorChange={(color) => props.update('text', { color })}
          onColorPreview={(color) => props.preview('text', { color })}
          onBackgroundColorPreview={(backgroundColor) => props.preview('text', { backgroundColor })}
          onFontFamilyChange={(fontFamily) => props.update('text', { fontFamily })}
          onFontSizeChange={(fontSize) => props.update('text', { fontSize })}
        />
      );
    case 'blur':
      return (
        <DrawingBlurStrengthOptions
          value={props.settings.blur.amount}
          onChange={(amount) => props.update('blur', { amount })}
        />
      );
    case 'selection':
      return null;
  }
}

export function EditorDrawingOptions(props: {
  onDirectionChange: () => void;
  onApplyToSelection: () => void;
  onPreviewSelection: () => void;
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
    props.tool === 'selection' ||
    props.selectedType === props.tool ||
    (props.tool === 'shape' && props.selectedType === 'shape');
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

  const preview = <Tool extends ConfigurableTool>(
    tool: Tool,
    patch: Partial<DrawingToolDefaults[Tool]>
  ) => {
    if (!selected) return;
    useEditorStore.getState().updateSelectionDrawingToolSettings(tool, patch);
    props.onPreviewSelection();
  };

  const common = {
    colors,
    floatingBoundaryRef: panelRef,
    floatingPlacement: 'auto' as const,
    vertical: false as const,
  };

  return (
    <div
      ref={panelRef}
      data-ui="editor.drawing.options"
      className={EDITOR_DRAWING_OPTIONS_CLASS_NAME}
    >
      <ToolOptions
        arrowDrawFromTip={toolSettings.arrow.drawFromTip}
        common={common}
        onDirectionChange={(drawFromTip) => {
          useEditorStore.getState().updateDrawingToolSettings('arrow', { drawFromTip });
          props.onDirectionChange();
        }}
        settings={values}
        tool={props.tool}
        update={update}
        preview={preview}
      />
    </div>
  );
}
