import { ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import type { ContentDrawingController } from '../../../drawing/controller';
import {
  DRAWING_MARKER_OPACITIES,
  DRAWING_MARKER_WIDTHS,
  DRAWING_OUTLINE_WIDTHS,
  DRAWING_PENCIL_WIDTHS,
  DRAWING_TEXT_SIZES,
  type DrawingObject,
  type DrawingSessionSnapshot,
  type DrawingTool,
} from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';

const DRAWING_SELECT_CLASS_NAME =
  'h-8 rounded-md border border-[var(--sniptale-color-border)] ' +
  'bg-[var(--sniptale-color-surface)] px-2 text-xs';

function DrawingColorInput(props: {
  color: string;
  palette: readonly string[];
  transparent?: boolean;
  onChange: (color: string | null) => void;
}) {
  return (
    <select
      aria-label={translate('content.toolbar.drawingColor')}
      title={translate('content.toolbar.drawingColor')}
      value={props.color}
      onChange={(event) =>
        props.onChange(event.target.value === 'transparent' ? null : event.target.value)
      }
      className="h-8 w-16 cursor-pointer rounded border border-[var(--sniptale-color-border)] px-1 text-xs"
      style={{
        backgroundColor: props.color === 'transparent' ? 'transparent' : props.color,
        color: props.color === '#ffffff' ? '#111827' : '#ffffff',
      }}
    >
      {props.transparent ? <option value="transparent">Ø</option> : null}
      {props.palette.map((color) => (
        <option key={color} value={color}>
          {color}
        </option>
      ))}
    </select>
  );
}

function DrawingNumberSelect(props: {
  label: string;
  value: number;
  values: readonly number[];
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <select
      aria-label={props.label}
      title={props.label}
      value={props.value}
      onChange={(event) => props.onChange(Number(event.target.value))}
      className={DRAWING_SELECT_CLASS_NAME}
    >
      {props.values.map((value) => (
        <option key={value} value={value}>
          {props.formatValue?.(value) ?? value}
        </option>
      ))}
    </select>
  );
}

export function ToolbarDrawingOptions(props: {
  controller: ContentDrawingController;
  snapshot: DrawingSessionSnapshot;
}) {
  const { controller, snapshot } = props;
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  const effectiveTool = selected?.kind ?? snapshot.activeTool;
  const defaults = snapshot.defaults;
  const color = resolveDrawingColor(selected, effectiveTool, defaults);
  const changeColor = (next: string | null) =>
    applyDrawingColor({ controller, defaults, effectiveTool, next, selected });

  return (
    <ContentToolbarGroup aria-label={translate('content.toolbar.drawingOptions')}>
      {color ? (
        <DrawingColorInput color={color} palette={controller.getPalette()} onChange={changeColor} />
      ) : null}
      <DrawingToolSpecificOptions
        controller={controller}
        effectiveTool={effectiveTool}
        selected={selected}
        defaults={defaults}
      />
    </ContentToolbarGroup>
  );
}

function DrawingToolSpecificOptions(props: {
  controller: ContentDrawingController;
  defaults: DrawingDefaults;
  effectiveTool: DrawingTool;
  selected: SelectedDrawingObject;
}) {
  const { controller, defaults, effectiveTool, selected } = props;
  const updateNumber = (
    kind: 'pencil' | 'marker' | 'rectangle' | 'ellipse',
    key: 'width' | 'opacity',
    value: number
  ) => applyDrawingNumber({ controller, defaults, key, kind, selected, value });
  const changeText = (key: 'fontSize' | 'backgroundColor', value: number | string | null) =>
    applyDrawingTextOption({ controller, defaults, key, selected, value });
  switch (effectiveTool) {
    case 'pencil':
      return (
        <DrawingNumberSelect
          label={translate('content.toolbar.drawingWidth')}
          value={selected?.kind === 'pencil' ? selected.width : defaults.pencil.width}
          values={DRAWING_PENCIL_WIDTHS}
          onChange={(value) => updateNumber('pencil', 'width', value)}
        />
      );
    case 'marker':
      return (
        <>
          <DrawingNumberSelect
            label={translate('content.toolbar.drawingWidth')}
            value={selected?.kind === 'marker' ? selected.width : defaults.marker.width}
            values={DRAWING_MARKER_WIDTHS}
            onChange={(value) => updateNumber('marker', 'width', value)}
          />
          <DrawingNumberSelect
            label={translate('content.toolbar.drawingOpacity')}
            value={selected?.kind === 'marker' ? selected.opacity : defaults.marker.opacity}
            values={DRAWING_MARKER_OPACITIES}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => updateNumber('marker', 'opacity', value)}
          />
        </>
      );
    case 'rectangle':
    case 'ellipse':
      return (
        <DrawingNumberSelect
          label={translate('content.toolbar.drawingWidth')}
          value={selected?.kind === effectiveTool ? selected.width : defaults[effectiveTool].width}
          values={DRAWING_OUTLINE_WIDTHS}
          onChange={(value) => updateNumber(effectiveTool, 'width', value)}
        />
      );
    case 'text':
      return (
        <>
          <DrawingNumberSelect
            label={translate('content.toolbar.drawingTextSize')}
            value={selected?.kind === 'text' ? selected.fontSize : defaults.text.fontSize}
            values={DRAWING_TEXT_SIZES}
            onChange={(value) => changeText('fontSize', value)}
          />
          <DrawingColorInput
            color={
              (selected?.kind === 'text'
                ? selected.backgroundColor
                : defaults.text.backgroundColor) ?? 'transparent'
            }
            palette={controller.getPalette()}
            transparent
            onChange={(value) => changeText('backgroundColor', value)}
          />
        </>
      );
    case 'arrow':
    case 'blur':
    case 'select':
      return null;
  }
}

type DrawingDefaults = DrawingSessionSnapshot['defaults'];
type SelectedDrawingObject = DrawingObject | undefined;

function resolveDrawingColor(
  selected: SelectedDrawingObject,
  tool: DrawingTool,
  defaults: DrawingDefaults
): string | null {
  if (selected && 'color' in selected) return selected.color;
  switch (tool) {
    case 'pencil':
      return defaults.pencil.color;
    case 'marker':
      return defaults.marker.color;
    case 'rectangle':
      return defaults.rectangle.color;
    case 'ellipse':
      return defaults.ellipse.color;
    case 'arrow':
      return defaults.arrow.color;
    case 'text':
      return defaults.text.color;
    case 'blur':
    case 'select':
      return null;
  }
}

function applyDrawingColor(args: {
  controller: ContentDrawingController;
  defaults: DrawingDefaults;
  effectiveTool: DrawingTool;
  next: string | null;
  selected: SelectedDrawingObject;
}) {
  const { controller, defaults, effectiveTool, next, selected } = args;
  if (!next) return;
  switch (effectiveTool) {
    case 'pencil':
      controller.session.setDefaults({ ...defaults, pencil: { ...defaults.pencil, color: next } });
      break;
    case 'marker':
      controller.session.setDefaults({ ...defaults, marker: { ...defaults.marker, color: next } });
      break;
    case 'rectangle':
      controller.session.setDefaults({
        ...defaults,
        rectangle: { ...defaults.rectangle, color: next },
      });
      break;
    case 'ellipse':
      controller.session.setDefaults({
        ...defaults,
        ellipse: { ...defaults.ellipse, color: next },
      });
      break;
    case 'arrow':
      controller.session.setDefaults({ ...defaults, arrow: { color: next } });
      break;
    case 'text':
      controller.session.setDefaults({ ...defaults, text: { ...defaults.text, color: next } });
      break;
    case 'blur':
    case 'select':
      break;
  }
  if (selected && 'color' in selected)
    controller.session.replaceObject({ ...selected, color: next });
}

function applyDrawingNumber(args: {
  controller: ContentDrawingController;
  defaults: DrawingDefaults;
  kind: 'pencil' | 'marker' | 'rectangle' | 'ellipse';
  key: 'width' | 'opacity';
  selected: SelectedDrawingObject;
  value: number;
}) {
  const { controller, defaults, key, kind, selected, value } = args;
  controller.session.setDefaults({ ...defaults, [kind]: { ...defaults[kind], [key]: value } });
  if (selected?.kind === kind) controller.session.replaceObject({ ...selected, [key]: value });
}

function applyDrawingTextOption(args: {
  controller: ContentDrawingController;
  defaults: DrawingDefaults;
  key: 'fontSize' | 'backgroundColor';
  selected: SelectedDrawingObject;
  value: number | string | null;
}) {
  const { controller, defaults, key, selected, value } = args;
  controller.session.setDefaults({ ...defaults, text: { ...defaults.text, [key]: value } });
  if (selected?.kind === 'text') controller.session.replaceObject({ ...selected, [key]: value });
}
