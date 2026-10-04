import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from 'react';
import type { ContentDrawingController } from '../../../drawing/controller';
import {
  DRAWING_ARROW_WIDTHS,
  DRAWING_MARKER_WIDTHS,
  DRAWING_OUTLINE_WIDTHS,
  DRAWING_PENCIL_WIDTHS,
  type DrawingObject,
  type DrawingSessionSnapshot,
  type DrawingShapeKind,
  type DrawingShapeObject,
} from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { getColorAlpha } from '@sniptale/foundation/color';
import {
  markerColorAtOpacity,
  markerColorPatch,
  markerVisibleColor,
} from '../../../../ui/drawing-tools/marker-color';
import {
  ArrowWidthModeOptions,
  ArrowDrawDirectionOption,
  DrawingColorOptions,
  DrawingBlurStrengthOptions,
  DrawingOptionsDivider,
  DrawingShapeOptions,
  DrawingShapeFillOptions,
  DrawingTextOptions,
  DrawingWidthOptions,
  MarkerOpacityOptions,
} from '../../../../ui/drawing-tools/options';
import { DrawingSelectionActions } from '../../../../ui/drawing-tools/selection-actions';
import type {
  DrawingQuickToolUpdate as QuickToolUpdate,
  SelectedQuickDrawingObject,
} from '../../../../features/drawing/updates';
import {
  changeSelectedQuickObjects,
  previewSelectedQuickObject,
  updateQuickToolOption,
  type ConfigurableDrawingQuickOptionsTool,
} from './drawing-options-updates';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  TOOLBAR_SECONDARY_MENU_Z_INDEX,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';

type DrawingQuickOptionsTool = ConfigurableDrawingQuickOptionsTool | 'blur' | 'selection';

const DRAWING_OPTIONS_DIMENSIONS: Record<
  'horizontal' | 'vertical',
  Record<DrawingQuickOptionsTool, { height: number; width: number }>
> = {
  horizontal: {
    arrow: { height: 48, width: 600 },
    blur: { height: 48, width: 336 },
    marker: { height: 48, width: 560 },
    pencil: { height: 48, width: 340 },
    shape: { height: 48, width: 694 },
    selection: { height: 48, width: 676 },
    text: { height: 48, width: 700 },
  },
  vertical: {
    arrow: { height: 290, width: 190 },
    blur: { height: 174, width: 136 },
    marker: { height: 250, width: 190 },
    pencil: { height: 170, width: 190 },
    shape: { height: 365, width: 190 },
    selection: { height: 365, width: 190 },
    text: { height: 420, width: 190 },
  },
};

function useDrawingOptionsLayout(args: {
  displayMode: 'horizontal' | 'vertical';
  hasSelection: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  tool: DrawingQuickOptionsTool;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [, setViewportRevision] = useState(0);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const surface = args.panelRef.current?.closest<HTMLElement>(
      '[data-ui="content.toolbar.drawing-options.pair"], .sniptale-drawing-options-menu'
    );
    const root =
      surface?.closest<HTMLElement>('[data-ui="content.toolbar.drawing-options.pair"]') ?? surface;
    const measure = () => {
      if (!root) return;
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      if (!width || !height) return;
      setMeasured((current) =>
        current?.width === width && current.height === height ? current : { width, height }
      );
    };
    const refresh = () => {
      measure();
      setViewportRevision((value) => value + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (root) observer?.observe(root);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [args.displayMode, args.hasSelection, args.panelRef, args.tool]);
  const dimensions = DRAWING_OPTIONS_DIMENSIONS[args.displayMode][args.tool];
  const menuHeight =
    measured?.height ??
    dimensions.height + (args.hasSelection && args.displayMode === 'vertical' ? 294 : 0);
  const menuWidth = Math.min(
    measured?.width ??
      dimensions.width + (args.hasSelection && args.displayMode === 'horizontal' ? 294 : 0),
    Math.max(0, window.innerWidth - 16)
  );
  const placement = getToolbarMenuPosition(args.triggerRef.current, menuHeight);
  const positioned = resolveToolbarFloatingMenuStyle({
    anchorEl: args.triggerRef.current,
    displayMode: args.displayMode,
    menuHeight,
    menuWidth,
    placement,
    preferredTop: args.hasSelection ? -16 : 0,
  });
  const fallback: CSSProperties =
    args.displayMode === 'vertical'
      ? { left: 'calc(100% + 10px)', top: 0 }
      : { left: 0, top: 'calc(100% + 10px)' };
  const verticalOverflow: CSSProperties =
    args.displayMode === 'vertical' ? { maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' } : {};
  return {
    placement: resolveToolbarMenuPlacement(args.displayMode, placement),
    style: {
      ...(positioned ?? fallback),
      maxWidth: 'calc(100vw - 16px)',
      minWidth: 0,
      overflowX: 'auto',
      padding: '8px',
      zIndex: TOOLBAR_SECONDARY_MENU_Z_INDEX,
      ...verticalOverflow,
    } satisfies CSSProperties,
  };
}

type DrawingOptionsBodyProps = {
  children: ReactNode;
  displayMode: 'horizontal' | 'vertical';
  panelRef: RefObject<HTMLDivElement | null>;
  tool: DrawingQuickOptionsTool;
};

function DrawingOptionsBody(props: DrawingOptionsBodyProps) {
  return (
    <div
      ref={props.panelRef}
      role="group"
      aria-label={translate('content.toolbar.drawingOptions')}
      data-ui={`content.toolbar.drawing-options.${props.tool}`}
      className={
        props.displayMode === 'vertical'
          ? 'flex flex-col items-center gap-2'
          : 'flex flex-row items-center gap-2'
      }
    >
      {props.children}
    </div>
  );
}

function DrawingOptionsPair(
  props: DrawingOptionsBodyProps & {
    controller: ContentDrawingController;
    layout: ReturnType<typeof useDrawingOptionsLayout>;
    selectedCount: number;
    totalCount: number;
  }
) {
  const options = (
    <DrawingOptionsBody panelRef={props.panelRef} tool={props.tool} displayMode={props.displayMode}>
      {props.children}
    </DrawingOptionsBody>
  );
  const actions = (
    <DrawingSelectionActions
      vertical={props.displayMode === 'vertical'}
      canReorder={props.selectedCount > 0 && props.totalCount > props.selectedCount}
      canDuplicate={props.selectedCount > 0}
      canDelete={props.selectedCount > 0}
      onMove={(direction) => props.controller.session.moveSelected(direction)}
      onDuplicate={() => props.controller.session.duplicateSelected()}
      onDelete={() => props.controller.session.deleteSelected()}
      onDeselect={() => props.controller.session.select(null)}
    />
  );
  return (
    <div
      data-ui="content.toolbar.drawing-options.pair"
      className={[
        'absolute flex max-w-[calc(100vw-16px)] items-start gap-2 overflow-x-auto',
        props.displayMode === 'vertical' ? 'flex-col' : 'flex-row',
      ].join(' ')}
      style={props.layout.style}
    >
      {Object.entries({ options, actions }).map(([key, content]) => (
        <ProductToolbarMenu
          key={key}
          compact
          variant="drawing"
          className="sniptale-drawing-options-popover"
          style={{ position: 'relative', top: 'auto', left: 'auto', minWidth: 0, zIndex: 'auto' }}
        >
          {content}
        </ProductToolbarMenu>
      ))}
    </div>
  );
}

function resolveSelectedQuickObject(
  object: DrawingObject | undefined,
  tool: ConfigurableDrawingQuickOptionsTool
): SelectedQuickDrawingObject {
  if (object?.kind === tool) return object;
  if (
    tool === 'shape' &&
    (object?.kind === 'rectangle' ||
      object?.kind === 'ellipse' ||
      object?.kind === 'triangle' ||
      object?.kind === 'parallelogram')
  ) {
    return object;
  }
  return null;
}

function resolveSelectedShape(selected: SelectedQuickDrawingObject): DrawingShapeObject | null {
  if (
    selected?.kind === 'rectangle' ||
    selected?.kind === 'ellipse' ||
    selected?.kind === 'triangle' ||
    selected?.kind === 'parallelogram'
  ) {
    return selected;
  }
  return null;
}

function resolveSelectedShapeKind(selected: SelectedQuickDrawingObject): DrawingShapeKind | null {
  return resolveSelectedShape(selected)?.kind ?? null;
}

export function resolveDrawingQuickOptionsTool(
  snapshot: DrawingSessionSnapshot
): DrawingQuickOptionsTool | null {
  if (snapshot.selectedObjectIds.length > 1) return 'selection';
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (selected?.kind === 'blur') return 'blur';
  if (selected?.kind === 'pencil' || selected?.kind === 'marker') return selected.kind;
  if (selected?.kind === 'arrow') return 'arrow';
  if (selected?.kind === 'text') return 'text';
  if (
    selected?.kind === 'rectangle' ||
    selected?.kind === 'ellipse' ||
    selected?.kind === 'triangle' ||
    selected?.kind === 'parallelogram'
  ) {
    return 'shape';
  }
  return snapshot.activeTool === 'pencil' ||
    snapshot.activeTool === 'blur' ||
    snapshot.activeTool === 'marker' ||
    snapshot.activeTool === 'shape' ||
    snapshot.activeTool === 'arrow' ||
    snapshot.activeTool === 'text'
    ? snapshot.activeTool
    : null;
}

function resolveObjectOptionsTool(
  object: DrawingObject
): ConfigurableDrawingQuickOptionsTool | null {
  if (object.kind === 'pencil' || object.kind === 'marker' || object.kind === 'arrow')
    return object.kind;
  if (object.kind === 'text') return 'text';
  if (
    object.kind === 'rectangle' ||
    object.kind === 'ellipse' ||
    object.kind === 'triangle' ||
    object.kind === 'parallelogram'
  )
    return 'shape';
  return null;
}

function isStrokeColorObject(
  object: DrawingObject
): object is Exclude<Exclude<DrawingObject, { kind: 'blur' | 'text' }>, never> {
  return object.kind !== 'blur' && object.kind !== 'text';
}

function visibleStrokeColor(object: Exclude<DrawingObject, { kind: 'blur' | 'text' }>): string {
  return object.kind === 'marker' ? markerVisibleColor(object.color, object.opacity) : object.color;
}

function applyStrokeColor(
  object: Exclude<DrawingObject, { kind: 'blur' | 'text' }>,
  color: string
) {
  return object.kind === 'marker'
    ? { ...object, ...markerColorPatch(color) }
    : { ...object, color };
}

function ToolbarDrawingSelectionOptions(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  panelRef: RefObject<HTMLDivElement | null>;
  selected: readonly DrawingObject[];
  snapshot: DrawingSessionSnapshot;
}) {
  const tools = props.selected.map(resolveObjectOptionsTool);
  const sharedTool = tools[0] && tools.every((tool) => tool === tools[0]) ? tools[0] : null;
  const selectedQuick = sharedTool
    ? props.selected
        .map((object) => resolveSelectedQuickObject(object, sharedTool))
        .filter((object): object is Exclude<SelectedQuickDrawingObject, null> => object !== null)
    : [];
  const update = (next: QuickToolUpdate) =>
    changeSelectedQuickObjects({
      controller: props.controller,
      selected: selectedQuick,
      update: next,
      preview: false,
    });
  const preview = (next: QuickToolUpdate) =>
    changeSelectedQuickObjects({
      controller: props.controller,
      selected: selectedQuick,
      update: next,
      preview: true,
    });
  const resetPreview = () => props.controller.session.clearObjectPreview();
  const vertical = props.displayMode === 'vertical';
  const strokeObjects = props.selected.filter(isStrokeColorObject);
  const hasSharedStrokeColor = strokeObjects.length === props.selected.length;
  const firstStrokeColor = strokeObjects[0] ? visibleStrokeColor(strokeObjects[0]) : null;
  const first = selectedQuick[0] ?? null;
  return (
    <>
      {sharedTool === 'text' && first?.kind === 'text' ? (
        <DrawingTextToolOptions
          controller={props.controller}
          displayMode={props.displayMode}
          panelRef={props.panelRef}
          selected={first}
          snapshot={props.snapshot}
          update={update}
          preview={preview}
          resetPreview={resetPreview}
        />
      ) : sharedTool && sharedTool !== 'text' && first ? (
        <DrawingNonTextToolOptions
          controller={props.controller}
          displayMode={props.displayMode}
          panelRef={props.panelRef}
          selected={first}
          snapshot={props.snapshot}
          tool={sharedTool}
          update={update}
          preview={preview}
          resetPreview={resetPreview}
        />
      ) : hasSharedStrokeColor ? (
        <DrawingColorOptions
          allowAlpha
          colors={[...props.controller.getPalette()]}
          floatingBoundaryRef={props.panelRef}
          floatingPlacement={vertical ? 'side' : 'auto'}
          label={translate('content.toolbar.drawingColor')}
          selectedValue={
            strokeObjects.every((object) => visibleStrokeColor(object) === firstStrokeColor)
              ? firstStrokeColor
              : null
          }
          vertical={vertical}
          value={firstStrokeColor ?? props.controller.getPalette()[0] ?? '#000000'}
          onSelect={(color) =>
            props.controller.session.replaceObjects(
              strokeObjects.map((object) => applyStrokeColor(object, color))
            )
          }
          onPreview={(color) =>
            props.controller.session.previewObjects(
              strokeObjects.map((object) => applyStrokeColor(object, color))
            )
          }
          onPreviewReset={resetPreview}
        />
      ) : null}
    </>
  );
}

function DrawingTextToolOptions(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  panelRef: RefObject<HTMLDivElement | null>;
  selected: Extract<DrawingObject, { kind: 'text' }> | null;
  snapshot: DrawingSessionSnapshot;
  update: (next: QuickToolUpdate) => void;
  preview: (next: QuickToolUpdate) => void;
  resetPreview: () => void;
}) {
  const defaults = props.snapshot.defaults.text;
  const values = props.selected ?? defaults;
  return (
    <DrawingTextOptions
      backgroundColor={values.backgroundColor}
      color={values.color}
      colors={props.controller.getPalette()}
      floatingBoundaryRef={props.panelRef}
      floatingPlacement={props.displayMode === 'vertical' ? 'side' : 'auto'}
      fontFamily={props.selected?.fontFamily ?? defaults.fontFamily}
      fontSize={values.fontSize}
      vertical={props.displayMode === 'vertical'}
      onBackgroundColorChange={(backgroundColor) => props.update({ backgroundColor })}
      onColorChange={(color) => props.update({ color })}
      onColorPreview={(color) => props.preview({ color })}
      onColorPreviewReset={props.resetPreview}
      onBackgroundColorPreview={(backgroundColor) => props.preview({ backgroundColor })}
      onBackgroundColorPreviewReset={props.resetPreview}
      onFontFamilyChange={(fontFamily) => props.update({ fontFamily })}
      onFontSizeChange={(fontSize) => props.update({ fontSize })}
    />
  );
}

function resolveDrawingWidthOptions(tool: Exclude<ConfigurableDrawingQuickOptionsTool, 'text'>) {
  switch (tool) {
    case 'pencil':
      return DRAWING_PENCIL_WIDTHS;
    case 'marker':
      return DRAWING_MARKER_WIDTHS;
    case 'arrow':
      return DRAWING_ARROW_WIDTHS;
    case 'shape':
      return DRAWING_OUTLINE_WIDTHS;
  }
}

function DrawingShapeFillToolOptions(props: {
  controller: ContentDrawingController;
  floatingPlacement: 'auto' | 'side';
  panelRef: RefObject<HTMLDivElement | null>;
  selected: DrawingShapeObject | null;
  snapshot: DrawingSessionSnapshot;
  vertical: boolean;
  update: (next: QuickToolUpdate) => void;
  preview: (next: QuickToolUpdate) => void;
  resetPreview: () => void;
}) {
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      <DrawingShapeFillOptions
        colors={[...props.controller.getPalette()]}
        floatingBoundaryRef={props.panelRef}
        floatingPlacement={props.floatingPlacement}
        value={
          props.selected
            ? (props.selected.fillColor ?? null)
            : props.snapshot.defaults.shape.fillColor
        }
        vertical={props.vertical}
        onChange={(fillColor) => props.update({ fillColor })}
        onPreview={(fillColor) => props.preview({ fillColor })}
        onPreviewReset={props.resetPreview}
      />
    </>
  );
}

function DrawingMarkerToolOptions(props: {
  selected: SelectedQuickDrawingObject;
  snapshot: DrawingSessionSnapshot;
  vertical: boolean;
  update: (next: QuickToolUpdate) => void;
}) {
  const marker =
    props.selected?.kind === 'marker' ? props.selected : props.snapshot.defaults.marker;
  const visibleColor = markerVisibleColor(marker.color, marker.opacity);
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      <MarkerOpacityOptions
        value={getColorAlpha(visibleColor) ?? 1}
        onChange={(opacity) => props.update(markerColorAtOpacity(visibleColor, opacity))}
      />
    </>
  );
}

function DrawingArrowToolOptions(props: {
  controller: ContentDrawingController;
  selected: SelectedQuickDrawingObject;
  snapshot: DrawingSessionSnapshot;
  vertical: boolean;
  update: (next: QuickToolUpdate) => void;
}) {
  const defaults = props.snapshot.defaults.arrow;
  const selected = props.selected?.kind === 'arrow' ? props.selected : null;
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      <ArrowWidthModeOptions
        design={selected?.design ?? defaults.design}
        dynamic={selected?.dynamicWidth ?? defaults.dynamicWidth}
        onChange={props.update}
      />
      <DrawingOptionsDivider vertical={props.vertical} />
      <ArrowDrawDirectionOption
        active={defaults.drawFromTip}
        dataUi="content.toolbar.drawing-options.arrow.from-tip"
        onChange={(drawFromTip) =>
          props.controller.session.setDefaults({
            ...props.snapshot.defaults,
            arrow: { ...defaults, drawFromTip },
          })
        }
      />
    </>
  );
}

function DrawingNonTextToolOptions(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  panelRef: RefObject<HTMLDivElement | null>;
  selected: SelectedQuickDrawingObject;
  snapshot: DrawingSessionSnapshot;
  tool: Exclude<ConfigurableDrawingQuickOptionsTool, 'text'>;
  update: (next: QuickToolUpdate) => void;
  preview: (next: QuickToolUpdate) => void;
  resetPreview: () => void;
}) {
  const { controller, displayMode, panelRef, selected, snapshot, tool, update } = props;
  const values = selected ?? snapshot.defaults[tool];
  const visibleColor =
    tool === 'marker'
      ? markerVisibleColor(values.color, (values as typeof snapshot.defaults.marker).opacity)
      : values.color;
  const selectedShape = resolveSelectedShape(selected);
  const width = 'width' in values ? values.width : snapshot.defaults.pencil.width;
  const vertical = displayMode === 'vertical';
  const floatingPlacement = vertical ? 'side' : 'auto';
  return (
    <>
      {tool === 'shape' ? (
        <>
          <DrawingShapeOptions
            value={resolveSelectedShapeKind(selected) ?? snapshot.defaults.shape.kind}
            onChange={(kind) => update({ kind })}
          />
          <DrawingOptionsDivider vertical={vertical} />
        </>
      ) : null}
      <DrawingWidthOptions
        tool={tool}
        value={width}
        values={resolveDrawingWidthOptions(tool)}
        onChange={(nextWidth) => update({ width: nextWidth })}
      />
      {tool === 'marker' ? (
        <DrawingMarkerToolOptions
          selected={selected}
          snapshot={snapshot}
          vertical={vertical}
          update={update}
        />
      ) : null}
      {tool === 'arrow' ? (
        <DrawingArrowToolOptions
          controller={controller}
          selected={selected}
          snapshot={snapshot}
          vertical={vertical}
          update={update}
        />
      ) : null}
      <DrawingOptionsDivider vertical={vertical} />
      <DrawingColorOptions
        allowAlpha
        colors={[...controller.getPalette()]}
        floatingBoundaryRef={panelRef}
        floatingPlacement={floatingPlacement}
        label={translate('content.toolbar.drawingColor')}
        vertical={vertical}
        value={visibleColor}
        onSelect={(color) => update(tool === 'marker' ? markerColorPatch(color) : { color })}
        onPreview={(color) =>
          props.preview(tool === 'marker' ? markerColorPatch(color) : { color })
        }
        onPreviewReset={props.resetPreview}
      />
      {tool === 'shape' ? (
        <DrawingShapeFillToolOptions
          controller={controller}
          floatingPlacement={floatingPlacement}
          panelRef={panelRef}
          selected={selectedShape}
          snapshot={snapshot}
          vertical={vertical}
          update={update}
          preview={props.preview}
          resetPreview={props.resetPreview}
        />
      ) : null}
    </>
  );
}

function DrawingOptionsSurface(
  props: DrawingOptionsBodyProps & {
    controller: ContentDrawingController;
    layout: ReturnType<typeof useDrawingOptionsLayout>;
    selected: boolean;
    snapshot: DrawingSessionSnapshot;
  }
) {
  if (props.selected) {
    return (
      <DrawingOptionsPair
        controller={props.controller}
        displayMode={props.displayMode}
        layout={props.layout}
        panelRef={props.panelRef}
        selectedCount={1}
        totalCount={props.snapshot.document.objects.length}
        tool={props.tool}
      >
        {props.children}
      </DrawingOptionsPair>
    );
  }
  return (
    <ProductToolbarMenu
      compact
      variant="drawing"
      className="sniptale-drawing-options-popover"
      placement={props.layout.placement}
      style={props.layout.style}
    >
      <DrawingOptionsBody
        panelRef={props.panelRef}
        tool={props.tool}
        displayMode={props.displayMode}
      >
        {props.children}
      </DrawingOptionsBody>
    </ProductToolbarMenu>
  );
}

export function ToolbarDrawingOptions(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  snapshot: DrawingSessionSnapshot;
  tool: DrawingQuickOptionsTool;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { controller, displayMode, snapshot, tool } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const layout = useDrawingOptionsLayout({
    displayMode,
    hasSelection: snapshot.selectedObjectIds.length > 0,
    panelRef,
    tool,
    triggerRef: props.triggerRef,
  });
  const selectedObject = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (tool === 'selection') {
    const selected = snapshot.document.objects.filter((object) =>
      snapshot.selectedObjectIds.includes(object.id)
    );
    return (
      <DrawingOptionsPair
        controller={controller}
        displayMode={displayMode}
        layout={layout}
        panelRef={panelRef}
        selectedCount={selected.length}
        totalCount={snapshot.document.objects.length}
        tool="selection"
      >
        <ToolbarDrawingSelectionOptions
          controller={controller}
          displayMode={displayMode}
          panelRef={panelRef}
          selected={selected}
          snapshot={snapshot}
        />
      </DrawingOptionsPair>
    );
  }
  if (tool === 'blur') {
    const selectedBlur = selectedObject?.kind === 'blur' ? selectedObject : null;
    const content = (
      <DrawingBlurStrengthOptions
        value={selectedBlur?.amount ?? (selectedBlur ? 10 : snapshot.defaults.blur.amount)}
        onChange={(amount) => {
          controller.session.setDefaults({ ...snapshot.defaults, blur: { amount } });
          if (selectedBlur) controller.session.replaceObject({ ...selectedBlur, amount });
        }}
      />
    );
    return (
      <DrawingOptionsSurface
        controller={controller}
        displayMode={displayMode}
        layout={layout}
        panelRef={panelRef}
        selected={selectedBlur !== null}
        snapshot={snapshot}
        tool="blur"
      >
        {content}
      </DrawingOptionsSurface>
    );
  }
  const selected = resolveSelectedQuickObject(selectedObject, tool);
  const update = (next: QuickToolUpdate) =>
    updateQuickToolOption({ controller, selected, snapshot, tool, update: next });
  const preview = (next: QuickToolUpdate) => {
    if (!selected) return;
    previewSelectedQuickObject(controller, selected, next);
  };
  const resetPreview = () => controller.session.clearObjectPreview();

  const content =
    tool === 'text' ? (
      <DrawingTextToolOptions
        controller={controller}
        displayMode={displayMode}
        panelRef={panelRef}
        selected={selected?.kind === 'text' ? selected : null}
        snapshot={snapshot}
        update={update}
        preview={preview}
        resetPreview={resetPreview}
      />
    ) : (
      <DrawingNonTextToolOptions
        controller={controller}
        displayMode={displayMode}
        panelRef={panelRef}
        selected={selected}
        snapshot={snapshot}
        tool={tool}
        update={update}
        preview={preview}
        resetPreview={resetPreview}
      />
    );
  return (
    <DrawingOptionsSurface
      controller={controller}
      displayMode={displayMode}
      layout={layout}
      panelRef={panelRef}
      selected={selected !== null}
      snapshot={snapshot}
      tool={tool}
    >
      {content}
    </DrawingOptionsSurface>
  );
}
