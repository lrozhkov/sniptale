import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
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
  DrawingDeselectOption,
  DrawingShapeOptions,
  DrawingTextOptions,
  DrawingWidthOptions,
  MarkerOpacityOptions,
} from './drawing-option-controls';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';

type ConfigurableDrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';
type DrawingQuickOptionsTool = ConfigurableDrawingQuickOptionsTool | 'blur';
type SelectedQuickDrawingObject =
  | Extract<DrawingObject, { kind: 'pencil' | 'marker' | 'arrow' | 'text' }>
  | DrawingShapeObject
  | null;
type QuickToolUpdate = {
  color?: string;
  backgroundColor?: string | null;
  dynamicWidth?: boolean;
  fontSize?: number;
  kind?: DrawingShapeKind;
  opacity?: number;
  width?: number;
};

const DRAWING_OPTIONS_DIMENSIONS: Record<
  DrawingQuickOptionsTool,
  { height: number; width: number }
> = {
  arrow: { height: 48, width: 520 },
  blur: { height: 48, width: 48 },
  marker: { height: 48, width: 520 },
  pencil: { height: 48, width: 300 },
  shape: { height: 48, width: 560 },
  text: { height: 88, width: 480 },
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
  const dimensions = DRAWING_OPTIONS_DIMENSIONS[args.tool];
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
  return {
    placement: resolveToolbarMenuPlacement(args.displayMode, placement),
    style: {
      ...(positioned ?? fallback),
      maxWidth: 'calc(100vw - 16px)',
      minWidth: 0,
      overflowX: 'auto',
      padding: '8px',
    } satisfies CSSProperties,
  };
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

function resolveSelectedShapeKind(selected: SelectedQuickDrawingObject): DrawingShapeKind | null {
  if (
    selected?.kind === 'rectangle' ||
    selected?.kind === 'ellipse' ||
    selected?.kind === 'triangle' ||
    selected?.kind === 'parallelogram'
  ) {
    return selected.kind;
  }
  return null;
}

function replaceSelectedQuickObject(
  controller: ContentDrawingController,
  selected: Exclude<SelectedQuickDrawingObject, null>,
  update: QuickToolUpdate
) {
  if (selected.kind === 'pencil') {
    controller.session.replaceObject({
      ...selected,
      color: update.color ?? selected.color,
      width: update.width ?? selected.width,
    });
    return;
  }
  if (selected.kind === 'marker') {
    controller.session.replaceObject({
      ...selected,
      color: update.color ?? selected.color,
      opacity: update.opacity ?? selected.opacity,
      width: update.width ?? selected.width,
    });
    return;
  }
  if (selected.kind === 'arrow') {
    controller.session.replaceObject({
      ...selected,
      color: update.color ?? selected.color,
      dynamicWidth: update.dynamicWidth ?? selected.dynamicWidth,
      width: update.width ?? selected.width,
    });
    return;
  }
  if (selected.kind === 'text') {
    controller.session.replaceObject({
      ...selected,
      backgroundColor:
        update.backgroundColor === undefined ? selected.backgroundColor : update.backgroundColor,
      color: update.color ?? selected.color,
      fontSize: update.fontSize ?? selected.fontSize,
    });
    return;
  }
  controller.session.replaceObject({
    bounds: selected.bounds,
    color: update.color ?? selected.color,
    id: selected.id,
    kind: update.kind ?? selected.kind,
    width: update.width ?? selected.width,
  });
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
        fontSize: update.fontSize ?? snapshot.defaults.text.fontSize,
      },
    });
  }
  if (selected) replaceSelectedQuickObject(controller, selected, update);
}

export function resolveDrawingQuickOptionsTool(
  snapshot: DrawingSessionSnapshot
): DrawingQuickOptionsTool | null {
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (selected?.kind === 'pencil' || selected?.kind === 'marker') return selected.kind;
  if (selected?.kind === 'blur') return 'blur';
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

export function ToolbarDrawingOptions(props: {
  controller: ContentDrawingController;
  displayMode: 'horizontal' | 'vertical';
  snapshot: DrawingSessionSnapshot;
  tool: DrawingQuickOptionsTool;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { controller, displayMode, snapshot, tool } = props;
  const layout = useDrawingOptionsLayout({ displayMode, tool, triggerRef: props.triggerRef });
  const selectedObject = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (tool === 'blur') {
    return (
      <ProductToolbarMenu
        compact
        className="sniptale-drawing-options-popover"
        placement={layout.placement}
        style={layout.style}
      >
        <div
          role="group"
          aria-label={translate('content.toolbar.drawingOptions')}
          data-ui="content.toolbar.drawing-options.blur"
          className="flex items-center gap-2"
        >
          <DrawingDeselectOption onClick={() => controller.session.select(null)} />
        </div>
      </ProductToolbarMenu>
    );
  }
  const selected = resolveSelectedQuickObject(selectedObject, tool);
  const values = selected ?? snapshot.defaults[tool];
  const width = 'width' in values ? values.width : snapshot.defaults.pencil.width;
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
        role="group"
        aria-label={translate('content.toolbar.drawingOptions')}
        data-ui={`content.toolbar.drawing-options.${tool}`}
        className="flex items-center gap-2"
      >
        {tool === 'text' ? (
          <DrawingTextOptions
            backgroundColor={
              selected?.kind === 'text'
                ? selected.backgroundColor
                : snapshot.defaults.text.backgroundColor
            }
            color={values.color}
            colors={controller.getPalette()}
            fontSize={
              selected?.kind === 'text' ? selected.fontSize : snapshot.defaults.text.fontSize
            }
            onBackgroundColorChange={(backgroundColor) => update({ backgroundColor })}
            onColorChange={(color) => update({ color })}
            onFontSizeChange={(fontSize) => update({ fontSize })}
          />
        ) : (
          <>
            {tool === 'shape' ? (
              <>
                <DrawingShapeOptions
                  value={resolveSelectedShapeKind(selected) ?? snapshot.defaults.shape.kind}
                  onChange={(kind) => update({ kind })}
                />
                <span aria-hidden className="h-5 w-px bg-[var(--sniptale-color-border-soft)]" />
              </>
            ) : null}
            <DrawingColorOptions
              colors={[...controller.getPalette()]}
              label={translate('content.toolbar.drawingColor')}
              value={values.color}
              onSelect={(color) => update({ color })}
            />
            <span aria-hidden className="h-5 w-px bg-[var(--sniptale-color-border-soft)]" />
            <DrawingWidthOptions
              tool={tool}
              value={width}
              values={
                tool === 'pencil'
                  ? DRAWING_PENCIL_WIDTHS
                  : tool === 'marker'
                    ? DRAWING_MARKER_WIDTHS
                    : tool === 'arrow'
                      ? DRAWING_ARROW_WIDTHS
                      : DRAWING_OUTLINE_WIDTHS
              }
              onChange={(width) => update({ width })}
            />
            {tool === 'marker' ? (
              <>
                <span aria-hidden className="h-5 w-px bg-[var(--sniptale-color-border-soft)]" />
                <MarkerOpacityOptions
                  value={
                    selected?.kind === 'marker'
                      ? selected.opacity
                      : snapshot.defaults.marker.opacity
                  }
                  onChange={(opacity) => update({ opacity })}
                />
              </>
            ) : null}
            {tool === 'arrow' ? (
              <>
                <span aria-hidden className="h-5 w-px bg-[var(--sniptale-color-border-soft)]" />
                <ArrowWidthModeOptions
                  dynamic={
                    selected?.kind === 'arrow'
                      ? selected.dynamicWidth
                      : snapshot.defaults.arrow.dynamicWidth
                  }
                  onChange={(dynamicWidth) => update({ dynamicWidth })}
                />
              </>
            ) : null}
          </>
        )}
        {selected ? (
          <>
            <span aria-hidden className="h-5 w-px bg-[var(--sniptale-color-border-soft)]" />
            <DrawingDeselectOption onClick={() => controller.session.select(null)} />
          </>
        ) : null}
      </div>
    </ProductToolbarMenu>
  );
}
