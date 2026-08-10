import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
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
import {
  ArrowWidthModeOptions,
  DrawingColorOptions,
  DrawingDeleteOption,
  DrawingDeselectOption,
  DrawingOptionsDivider,
  DrawingShapeOptions,
  DrawingShapeFillOptions,
  DrawingTextOptions,
  DrawingWidthOptions,
  MarkerOpacityOptions,
} from './drawing-option-controls';
import {
  resolveUpdatedQuickObject,
  type DrawingQuickToolUpdate as QuickToolUpdate,
  type SelectedQuickDrawingObject,
} from './drawing-option-update';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  TOOLBAR_SECONDARY_MENU_Z_INDEX,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';

type ConfigurableDrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';
type DrawingQuickOptionsTool = ConfigurableDrawingQuickOptionsTool | 'blur' | 'selection';

const DRAWING_OPTIONS_DIMENSIONS: Record<
  'horizontal' | 'vertical',
  Record<DrawingQuickOptionsTool, { height: number; width: number }>
> = {
  horizontal: {
    arrow: { height: 48, width: 534 },
    blur: { height: 48, width: 80 },
    marker: { height: 48, width: 534 },
    pencil: { height: 48, width: 314 },
    shape: { height: 48, width: 668 },
    selection: { height: 48, width: 676 },
    text: { height: 88, width: 676 },
  },
  vertical: {
    arrow: { height: 346, width: 136 },
    blur: { height: 80, width: 48 },
    marker: { height: 346, width: 136 },
    pencil: { height: 266, width: 136 },
    shape: { height: 482, width: 136 },
    selection: { height: 482, width: 152 },
    text: { height: 642, width: 152 },
  },
};

function useDrawingOptionsLayout(args: {
  displayMode: 'horizontal' | 'vertical';
  tool: DrawingQuickOptionsTool;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [, setViewportRevision] = useState(0);
  useLayoutEffect(() => {
    const refresh = () => setViewportRevision((value) => value + 1);
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, []);
  const dimensions = DRAWING_OPTIONS_DIMENSIONS[args.displayMode][args.tool];
  const menuWidth = Math.min(dimensions.width, Math.max(0, window.innerWidth - 16));
  const placement = getToolbarMenuPosition(args.triggerRef.current, dimensions.height);
  const positioned = resolveToolbarFloatingMenuStyle({
    anchorEl: args.triggerRef.current,
    displayMode: args.displayMode,
    menuHeight: dimensions.height,
    menuWidth,
    placement,
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

function getDrawingOptionsLayoutClass(displayMode: 'horizontal' | 'vertical'): string {
  return displayMode === 'vertical'
    ? 'flex flex-col items-center gap-2'
    : 'flex flex-row items-center gap-2';
}

function resolveSelectedQuickObject(
  object: DrawingObject | undefined,
  tool: ConfigurableDrawingQuickOptionsTool
): SelectedQuickDrawingObject {
  if (tool === 'pencil' && object?.kind === 'pencil') return object;
  if (tool === 'marker' && object?.kind === 'marker') return object;
  if (tool === 'arrow' && object?.kind === 'arrow') return object;
  if (tool === 'text' && object?.kind === 'text') return object;
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

function replaceSelectedQuickObject(
  controller: ContentDrawingController,
  selected: Exclude<SelectedQuickDrawingObject, null>,
  update: QuickToolUpdate
) {
  controller.session.replaceObject(resolveUpdatedQuickObject(selected, update));
}

function updateQuickToolOption(args: {
  controller: ContentDrawingController;
  selected: SelectedQuickDrawingObject;
  snapshot: DrawingSessionSnapshot;
  tool: ConfigurableDrawingQuickOptionsTool;
  update: QuickToolUpdate;
}) {
  const { controller, selected, snapshot, tool, update } = args;
  if (tool === 'pencil') {
    controller.session.setDefaults({
      ...snapshot.defaults,
      pencil: { ...snapshot.defaults.pencil, ...update },
    });
  } else if (tool === 'marker') {
    controller.session.setDefaults({
      ...snapshot.defaults,
      marker: { ...snapshot.defaults.marker, ...update },
    });
  } else if (tool === 'shape') {
    controller.session.setDefaults({
      ...snapshot.defaults,
      shape: { ...snapshot.defaults.shape, ...update },
    });
  } else if (tool === 'arrow') {
    controller.session.setDefaults({
      ...snapshot.defaults,
      arrow: {
        ...snapshot.defaults.arrow,
        color: update.color ?? snapshot.defaults.arrow.color,
        design: update.design ?? snapshot.defaults.arrow.design,
        dynamicWidth: update.dynamicWidth ?? snapshot.defaults.arrow.dynamicWidth,
        width: update.width ?? snapshot.defaults.arrow.width,
      },
    });
  } else {
    controller.session.setDefaults({
      ...snapshot.defaults,
      text: {
        ...snapshot.defaults.text,
        backgroundColor:
          update.backgroundColor === undefined
            ? snapshot.defaults.text.backgroundColor
            : update.backgroundColor,
        color: update.color ?? snapshot.defaults.text.color,
        fontFamily: update.fontFamily ?? snapshot.defaults.text.fontFamily,
        fontSize: update.fontSize ?? snapshot.defaults.text.fontSize,
      },
    });
  }
  if (selected) replaceSelectedQuickObject(controller, selected, update);
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
  const update = (next: QuickToolUpdate) => {
    props.controller.session.replaceObjects(
      selectedQuick.map((object) => resolveUpdatedQuickObject(object, next))
    );
  };
  const vertical = props.displayMode === 'vertical';
  const strokeObjects = props.selected.filter(isStrokeColorObject);
  const hasSharedStrokeColor = strokeObjects.length === props.selected.length;
  const hasProperties = Boolean(sharedTool || hasSharedStrokeColor);
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
        />
      ) : hasSharedStrokeColor ? (
        <DrawingColorOptions
          colors={[...props.controller.getPalette()]}
          floatingBoundaryRef={props.panelRef}
          floatingPlacement={vertical ? 'side' : 'auto'}
          label={translate('content.toolbar.drawingColor')}
          selectedValue={
            strokeObjects.every((object) => object.color === strokeObjects[0]!.color)
              ? strokeObjects[0]!.color
              : null
          }
          vertical={vertical}
          value={strokeObjects[0]?.color ?? props.controller.getPalette()[0] ?? '#000000'}
          onSelect={(color) =>
            props.controller.session.replaceObjects(
              strokeObjects.map((object) => ({ ...object, color }))
            )
          }
        />
      ) : null}
      {hasProperties ? <DrawingOptionsDivider vertical={vertical} /> : null}
      <DrawingDeleteOption onClick={() => props.controller.session.deleteSelected()} />
      <DrawingDeselectOption onClick={() => props.controller.session.select(null)} />
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
  return (
    <>
      <DrawingOptionsDivider vertical={props.vertical} />
      <MarkerOpacityOptions
        value={
          props.selected?.kind === 'marker'
            ? props.selected.opacity
            : props.snapshot.defaults.marker.opacity
        }
        onChange={(opacity) => props.update({ opacity })}
      />
    </>
  );
}

function DrawingArrowToolOptions(props: {
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
}) {
  const { controller, displayMode, panelRef, selected, snapshot, tool, update } = props;
  const values = selected ?? snapshot.defaults[tool];
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
      <DrawingColorOptions
        colors={[...controller.getPalette()]}
        floatingBoundaryRef={panelRef}
        floatingPlacement={floatingPlacement}
        label={translate('content.toolbar.drawingColor')}
        vertical={vertical}
        value={values.color}
        onSelect={(color) => update({ color })}
      />
      <DrawingOptionsDivider vertical={vertical} />
      <DrawingWidthOptions
        tool={tool}
        value={width}
        values={resolveDrawingWidthOptions(tool)}
        onChange={(nextWidth) => update({ width: nextWidth })}
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
        />
      ) : null}
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
          selected={selected}
          snapshot={snapshot}
          vertical={vertical}
          update={update}
        />
      ) : null}
    </>
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
  const layout = useDrawingOptionsLayout({ displayMode, tool, triggerRef: props.triggerRef });
  const selectedObject = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (tool === 'selection') {
    const selected = snapshot.document.objects.filter((object) =>
      snapshot.selectedObjectIds.includes(object.id)
    );
    return (
      <ProductToolbarMenu
        compact
        className="sniptale-drawing-options-popover"
        placement={layout.placement}
        style={layout.style}
      >
        <div
          ref={panelRef}
          role="group"
          aria-label={translate('content.toolbar.drawingOptions')}
          data-ui="content.toolbar.drawing-options.selection"
          className={getDrawingOptionsLayoutClass(displayMode)}
        >
          <ToolbarDrawingSelectionOptions
            controller={controller}
            displayMode={displayMode}
            panelRef={panelRef}
            selected={selected}
            snapshot={snapshot}
          />
        </div>
      </ProductToolbarMenu>
    );
  }
  if (tool === 'blur') {
    return (
      <ProductToolbarMenu
        compact
        className="sniptale-drawing-options-popover"
        placement={layout.placement}
        style={layout.style}
      >
        <div
          ref={panelRef}
          role="group"
          aria-label={translate('content.toolbar.drawingOptions')}
          data-ui="content.toolbar.drawing-options.blur"
          className={getDrawingOptionsLayoutClass(displayMode)}
        >
          <DrawingDeleteOption onClick={() => controller.session.deleteSelected()} />
          <DrawingDeselectOption onClick={() => controller.session.select(null)} />
        </div>
      </ProductToolbarMenu>
    );
  }
  const selected = resolveSelectedQuickObject(selectedObject, tool);
  const update = (next: QuickToolUpdate) =>
    updateQuickToolOption({ controller, selected, snapshot, tool, update: next });

  return (
    <ProductToolbarMenu
      compact
      className="sniptale-drawing-options-popover"
      placement={layout.placement}
      style={layout.style}
    >
      <div
        ref={panelRef}
        role="group"
        aria-label={translate('content.toolbar.drawingOptions')}
        data-ui={`content.toolbar.drawing-options.${tool}`}
        className={getDrawingOptionsLayoutClass(displayMode)}
      >
        {tool === 'text' ? (
          <DrawingTextToolOptions
            controller={controller}
            displayMode={displayMode}
            panelRef={panelRef}
            selected={selected?.kind === 'text' ? selected : null}
            snapshot={snapshot}
            update={update}
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
          />
        )}
        {selected ? (
          <>
            <DrawingOptionsDivider vertical={displayMode === 'vertical'} />
            <DrawingDeleteOption onClick={() => controller.session.deleteSelected()} />
            <DrawingDeselectOption onClick={() => controller.session.select(null)} />
          </>
        ) : null}
      </div>
    </ProductToolbarMenu>
  );
}
