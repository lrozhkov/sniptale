import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { TablerIcon } from '../../inspector/compact/tabler-icon';
import { CANVAS_TOOLBAR_GROUP_TITLES, type FloatingToolbarGroup } from './canvas-toolbar-model';
import {
  createToolbarGroup,
  getToolbarCommand,
  isToolbarCommand,
  type ToolbarGroupSpec,
} from './toolbar-group-builders';

const RASTER_GROUP_ORDER = ['content', 'geometry', 'fill', 'effects', 'more'] as const;
type RasterGroupId = (typeof RASTER_GROUP_ORDER)[number];

interface RasterToolbarCommands {
  brushClear: CompactCommand | null;
  brushColor: CompactCommand | null;
  brushHardness: CompactCommand | null;
  brushOpacity: CompactCommand | null;
  brushSize: CompactCommand | null;
  eraserClear: CompactCommand | null;
  eraserSize: CompactCommand | null;
  fillClear: CompactCommand | null;
  fillColor: CompactCommand | null;
  fillGradient: CompactCommand | null;
  fillMode: CompactCommand | null;
  selectionClear: CompactCommand | null;
  selectionMode: CompactCommand | null;
}

function collectRasterCommands(commands: CompactCommand[]): RasterToolbarCommands {
  return {
    brushClear: getToolbarCommand(commands, 'raster-brush-clear'),
    brushColor: getToolbarCommand(commands, 'raster-brush-color'),
    brushHardness: getToolbarCommand(commands, 'raster-brush-hardness'),
    brushOpacity: getToolbarCommand(commands, 'raster-brush-opacity'),
    brushSize: getToolbarCommand(commands, 'raster-brush-size'),
    eraserClear: getToolbarCommand(commands, 'raster-eraser-clear'),
    eraserSize: getToolbarCommand(commands, 'raster-eraser-size'),
    fillClear: getToolbarCommand(commands, 'raster-fill-selection'),
    fillColor: getToolbarCommand(commands, 'raster-fill-color'),
    fillGradient: getToolbarCommand(commands, 'raster-fill-gradient'),
    fillMode: getToolbarCommand(commands, 'raster-fill-mode'),
    selectionClear: getToolbarCommand(commands, 'raster-selection-clear'),
    selectionMode: getToolbarCommand(commands, 'raster-selection-mode'),
  };
}

type RasterGroupSpec = ToolbarGroupSpec<RasterGroupId>;

function createRasterGroupSpecs(rasterCommands: RasterToolbarCommands): RasterGroupSpec[] {
  return [
    createRasterContentGroupSpec(rasterCommands),
    createRasterGeometryGroupSpec(rasterCommands),
    createRasterFillGroupSpec(rasterCommands),
    createRasterEffectsGroupSpec(rasterCommands),
    createRasterMoreGroupSpec(rasterCommands),
  ];
}

function createRasterContentGroupSpec(rasterCommands: RasterToolbarCommands): RasterGroupSpec {
  return {
    id: 'content',
    kind: 'content',
    title: CANVAS_TOOLBAR_GROUP_TITLES.content,
    commands: rasterCommands.selectionMode ? [rasterCommands.selectionMode] : [],
    trigger: <TablerIcon icon="tabler:lasso" />,
    width: 'simple',
  };
}

function createRasterGeometryGroupSpec(rasterCommands: RasterToolbarCommands): RasterGroupSpec {
  return {
    id: 'geometry',
    kind: 'geometry',
    title: CANVAS_TOOLBAR_GROUP_TITLES.geometry,
    commands: [rasterCommands.brushSize, rasterCommands.eraserSize].filter(isToolbarCommand),
    trigger: rasterCommands.brushSize?.trigger ?? rasterCommands.eraserSize?.trigger ?? (
      <TablerIcon icon="tabler:eraser" />
    ),
    width: 'simple',
  };
}

function createRasterFillGroupSpec(rasterCommands: RasterToolbarCommands): RasterGroupSpec {
  return {
    id: 'fill',
    kind: 'fill',
    title: translate('editor.sidebar.rasterFillMode'),
    commands: [
      rasterCommands.brushColor,
      rasterCommands.brushOpacity,
      rasterCommands.fillMode,
      rasterCommands.fillGradient,
      rasterCommands.fillColor,
    ].filter(isToolbarCommand),
    trigger: rasterCommands.brushColor?.trigger ??
      rasterCommands.fillGradient?.trigger ??
      rasterCommands.fillColor?.trigger ?? <TablerIcon icon="tabler:bucket" />,
    width: 'simple',
  };
}

function createRasterEffectsGroupSpec(rasterCommands: RasterToolbarCommands): RasterGroupSpec {
  return {
    id: 'effects',
    kind: 'effects',
    title: CANVAS_TOOLBAR_GROUP_TITLES.effects,
    commands: rasterCommands.brushHardness ? [rasterCommands.brushHardness] : [],
    trigger: rasterCommands.brushHardness?.trigger ?? <TablerIcon icon="tabler:contrast-filled" />,
    width: 'simple',
  };
}

function createRasterMoreGroupSpec(rasterCommands: RasterToolbarCommands): RasterGroupSpec {
  return {
    id: 'more',
    kind: 'more',
    title: CANVAS_TOOLBAR_GROUP_TITLES.more,
    commands: [
      rasterCommands.selectionClear,
      rasterCommands.brushClear,
      rasterCommands.eraserClear,
      rasterCommands.fillClear,
    ].filter(isToolbarCommand),
    trigger: <TablerIcon icon="tabler:dots-vertical" />,
    width: 'simple',
  };
}

function isRasterToolbarCommandSet(commands: CompactCommand[]): boolean {
  return commands.some((command) => command.id.startsWith('raster-'));
}

function sortRasterToolbarGroups(groups: FloatingToolbarGroup[]): FloatingToolbarGroup[] {
  return groups.sort(
    (left, right) =>
      RASTER_GROUP_ORDER.indexOf(left.id as RasterGroupId) -
      RASTER_GROUP_ORDER.indexOf(right.id as RasterGroupId)
  );
}

export function createRasterToolbarGroups(
  commands: CompactCommand[]
): FloatingToolbarGroup[] | null {
  if (!isRasterToolbarCommandSet(commands)) {
    return null;
  }

  const groups = createRasterGroupSpecs(collectRasterCommands(commands)).map(createToolbarGroup);
  return sortRasterToolbarGroups(
    groups.filter((group): group is FloatingToolbarGroup => group !== null)
  );
}
