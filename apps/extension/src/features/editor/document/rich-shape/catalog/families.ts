export const EDITOR_RICH_SHAPE_FAMILY = {
  OFFICE: 'office',
  LINE: 'line',
  CONNECTOR: 'connector',
  ARROW: 'arrow',
  BLOCK_ARROW: 'block-arrow',
  CALLOUT: 'callout',
  FLOWCHART: 'flowchart',
  EQUATION: 'equation',
  STAR_BANNER: 'star-banner',
  ACTION: 'action',
  CUSTOM: 'custom',
  LIBRARY: 'library',
} as const;

export const EDITOR_RICH_SHAPE_KINDS_BY_FAMILY = {
  [EDITOR_RICH_SHAPE_FAMILY.OFFICE]: [
    'rectangle',
    'round-rectangle',
    'ellipse',
    'diamond',
    'triangle',
    'right-triangle',
    'isosceles-triangle',
    'parallelogram',
    'trapezoid',
    'pentagon',
    'hexagon',
    'octagon',
    'plus',
    'cross',
    'left-bracket',
    'right-bracket',
    'left-brace',
    'right-brace',
    'arc',
    'pie',
    'chord',
    'frame',
    'cube',
    'can',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.LINE]: ['line', 'freeform', 'scribble'],
  [EDITOR_RICH_SHAPE_FAMILY.CONNECTOR]: [
    'straight-connector',
    'elbow-connector',
    'curved-connector',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.ARROW]: [
    'line-arrow',
    'double-line-arrow',
    'left-line-arrow',
    'curved-arrow',
    'u-turn-arrow',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.BLOCK_ARROW]: [
    'right-arrow',
    'left-arrow',
    'up-arrow',
    'down-arrow',
    'left-right-arrow',
    'up-down-arrow',
    'quad-arrow',
    'notched-right-arrow',
    'striped-right-arrow',
    'bent-up-arrow',
    'u-turn-block-arrow',
    'circular-arrow',
    'curved-right-arrow',
    'chevron',
    'left-right-chevron',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.CALLOUT]: [
    'dynamic-callout',
    'rect-callout',
    'round-rect-callout',
    'oval-callout',
    'cloud-callout',
    'line-callout',
    'line-callout-2',
    'line-callout-3',
    'right-arrow-callout',
    'down-arrow-callout',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.FLOWCHART]: [
    'process',
    'decision',
    'data',
    'document',
    'predefined-process',
    'terminator',
    'manual-input',
    'preparation',
    'connector',
    'offpage-connector',
    'delay',
    'display',
    'stored-data',
    'database',
    'internal-storage',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.EQUATION]: [
    'math-plus',
    'math-minus',
    'math-multiply',
    'math-divide',
    'math-equal',
    'math-not-equal',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.STAR_BANNER]: [
    'star-4',
    'star-5',
    'star-8',
    'star-16',
    'burst-12',
    'ribbon',
    'double-ribbon',
    'wave',
    'scroll',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.ACTION]: [
    'action-button-home',
    'action-button-information',
    'action-button-back',
    'action-button-forward',
    'action-button-return',
    'action-button-end',
    'action-button-help',
  ],
  [EDITOR_RICH_SHAPE_FAMILY.CUSTOM]: ['custom-shape'],
  [EDITOR_RICH_SHAPE_FAMILY.LIBRARY]: [
    'library-shape',
    'excalidraw-library-item',
    'excalidraw-export-item',
  ],
} as const;

export type EditorRichShapeFamily =
  (typeof EDITOR_RICH_SHAPE_FAMILY)[keyof typeof EDITOR_RICH_SHAPE_FAMILY];

type RichShapeKindsByFamily = typeof EDITOR_RICH_SHAPE_KINDS_BY_FAMILY;

export type EditorKnownRichShapeKind = RichShapeKindsByFamily[keyof RichShapeKindsByFamily][number];

export function isEditorRichShapeFamily(value: unknown): value is EditorRichShapeFamily {
  return Object.values(EDITOR_RICH_SHAPE_FAMILY).includes(value as EditorRichShapeFamily);
}

export function isEditorKnownRichShapeKind(value: string): value is EditorKnownRichShapeKind {
  return Object.values(EDITOR_RICH_SHAPE_KINDS_BY_FAMILY).some((familyKinds) =>
    (familyKinds as readonly string[]).includes(value)
  );
}

export function resolveEditorRichShapeFamily(
  kind: string,
  fallback: EditorRichShapeFamily = EDITOR_RICH_SHAPE_FAMILY.CUSTOM
): EditorRichShapeFamily {
  for (const [family, familyKinds] of Object.entries(EDITOR_RICH_SHAPE_KINDS_BY_FAMILY)) {
    if ((familyKinds as readonly string[]).includes(kind)) {
      return family as EditorRichShapeFamily;
    }
  }

  return fallback;
}
