import type { SelectionModeState } from './state';

const selectionModeLocalKeys = [
  'aspectRatio',
  'cleanupEventListeners',
  'cleanupScrollListeners',
  'currentSelection',
  'currentState',
  'dom',
  'dragStartPoint',
  'dragThreshold',
  'hasMovedEnough',
  'hoveredElement',
  'isActive',
  'isDragging',
  'isResizing',
  'maintainAspectRatio',
  'mouseDownPoint',
  'rejectCallback',
  'resolveCallback',
  'resizeDirection',
  'selectionAtDragStart',
  'skipNextClick',
] as const;

const selectionModeMutableLocalKeys = [
  'aspectRatio',
  'cleanupEventListeners',
  'cleanupScrollListeners',
  'currentSelection',
  'currentState',
  'dom',
  'dragStartPoint',
  'dragThreshold',
  'hasMovedEnough',
  'hoveredElement',
  'isActive',
  'isDragging',
  'isResizing',
  'maintainAspectRatio',
  'mouseDownPoint',
  'resizeDirection',
  'selectionAtDragStart',
  'skipNextClick',
] as const;

type SelectionModeLocalKey = (typeof selectionModeLocalKeys)[number];
type SelectionModeMutableLocalKey = (typeof selectionModeMutableLocalKeys)[number];
type AccessorName<Prefix extends string, Key extends string> = `${Prefix}${Capitalize<Key>}`;

export type SelectionModeLocals = Pick<SelectionModeState, SelectionModeLocalKey>;
export type SelectionModeMutableLocals = Pick<SelectionModeState, SelectionModeMutableLocalKey>;
export type SelectionModeSession = SelectionModeLocals;
export type SelectionModeMutableRefs = SelectionModeMutableLocals;
export type SelectionModeRuntimeState = SelectionModeMutableLocals;
export type SelectionModeMutableLocalsGetters = {
  [Key in SelectionModeMutableLocalKey as AccessorName<
    'get',
    Key
  >]: () => SelectionModeMutableLocals[Key];
};
export type SelectionModeMutableLocalsSetters = {
  [Key in SelectionModeMutableLocalKey as AccessorName<'set', Key>]: (
    value: SelectionModeMutableLocals[Key]
  ) => void;
};

export function createSelectionModeLocalsSnapshot(
  source: SelectionModeLocals
): SelectionModeLocals {
  return copySelectionModeLocalShape(source, selectionModeLocalKeys);
}

export function createSelectionModeMutableLocalsSnapshot(
  source: SelectionModeMutableLocals
): SelectionModeMutableLocals {
  return copySelectionModeLocalShape(source, selectionModeMutableLocalKeys);
}

export function applySelectionModeStateLocals(
  state: SelectionModeState,
  locals: SelectionModeLocals
): void {
  Object.assign(state, createSelectionModeLocalsSnapshot(locals));
}

export function applySelectionModeMutableLocals<T extends SelectionModeMutableLocals>(
  target: T,
  locals: SelectionModeMutableLocals
): T {
  return Object.assign(target, createSelectionModeMutableLocalsSnapshot(locals));
}

function copySelectionModeLocalShape<Key extends keyof SelectionModeState>(
  source: Pick<SelectionModeState, Key>,
  keys: readonly Key[]
): Pick<SelectionModeState, Key> {
  const snapshot = {} as Pick<SelectionModeState, Key>;

  for (const key of keys) {
    snapshot[key] = source[key];
  }

  return snapshot;
}
