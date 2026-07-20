import { EFFECT_V1_COMMAND_OPS } from '../model/types.js';

// policyStateIds: [] - graph operations and command keys are immutable contract validation policy.
const MAX_GRAPH_DEPTH = 32;
const MAX_GRAPH_NODES = 4096;
const MAX_LOOP_ITERATIONS = 512;
const MAX_EXPANDED_COMMANDS = 50_000;

export const EFFECT_V1_GRAPH_LIMITS = Object.freeze({
  expandedCommands: MAX_EXPANDED_COMMANDS,
  graphDepth: MAX_GRAPH_DEPTH,
  graphNodes: MAX_GRAPH_NODES,
  loopIterations: MAX_LOOP_ITERATIONS,
});

export const GRAPH_OPS = new Set<string>(EFFECT_V1_COMMAND_OPS);

export function commandNeedsChildren(op: string): boolean {
  return [
    'clip',
    'forEach',
    'forGrid',
    'forRange',
    'group',
    'let',
    'renderPass',
    'stableOrderBy',
    'when',
  ].includes(op);
}

export function isLoopCommand(op: string): boolean {
  return ['forEach', 'forGrid', 'forRange', 'stableOrderBy'].includes(op);
}

export const COMMAND_KEYS: Record<string, Set<string>> = {
  clear: fields('color'),
  clip: fields('commands', 'height', 'width', 'x', 'y'),
  compositePass: fields(
    'alpha',
    'blend',
    'filter',
    'height',
    'passId',
    'rotation',
    'shadow',
    'width',
    'x',
    'y'
  ),
  fillRect: fields('alpha', 'blend', 'fill', 'filter', 'height', 'shadow', 'width', 'x', 'y'),
  forEach: fields('commands', 'itemVar', 'items'),
  forGrid: fields('columnVar', 'columns', 'commands', 'rowVar', 'rows'),
  forRange: fields('commands', 'count', 'indexVar'),
  group: fields(
    'alpha',
    'blend',
    'commands',
    'filter',
    'rotation',
    'scaleX',
    'scaleY',
    'shadow',
    'x',
    'y'
  ),
  image: fields(
    'alpha',
    'assetId',
    'blend',
    'filter',
    'fit',
    'height',
    'input',
    'rotation',
    'shadow',
    'width',
    'x',
    'y'
  ),
  let: fields('bindings', 'commands'),
  path: fields(
    'alpha',
    'blend',
    'closed',
    'fill',
    'filter',
    'lineCap',
    'lineJoin',
    'lineWidth',
    'points',
    'segments',
    'shadow',
    'stroke'
  ),
  polyline: fields(
    'alpha',
    'blend',
    'filter',
    'lineCap',
    'lineJoin',
    'lineWidth',
    'points',
    'progress',
    'shadow',
    'stroke'
  ),
  renderPass: fields('commands', 'height', 'id', 'width'),
  sampledPath: fields(
    'alpha',
    'blend',
    'filter',
    'from',
    'lineCap',
    'lineJoin',
    'lineWidth',
    'samples',
    'sampleVar',
    'shadow',
    'stroke',
    'to',
    'x',
    'y'
  ),
  shape: fields(
    'alpha',
    'blend',
    'fill',
    'filter',
    'height',
    'lineWidth',
    'radius',
    'rotation',
    'shadow',
    'shape',
    'stroke',
    'width',
    'x',
    'y'
  ),
  stableOrderBy: fields('commands', 'direction', 'itemVar', 'items', 'key'),
  svgParts: fields(
    'alpha',
    'blend',
    'assetId',
    'filter',
    'height',
    'part',
    'shadow',
    'width',
    'x',
    'y'
  ),
  text: fields(
    'alpha',
    'align',
    'baseline',
    'blend',
    'caret',
    'fill',
    'filter',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'maxWidth',
    'reveal',
    'shadow',
    'text',
    'x',
    'y'
  ),
  when: fields('commands', 'condition'),
};

function fields(...names: string[]): Set<string> {
  return new Set(['layerId', 'op', ...names]);
}
