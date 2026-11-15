import { getColorAlpha, replaceColorChannels } from '@sniptale/foundation/color';
import {
  isEditorVectorColor,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';

export interface EditorVectorPresentation {
  colors: Readonly<Record<string, string>>;
  previewUrl: string;
  opacity: number;
  strokeScale: number;
}

export interface EditorIconAppearance {
  dark: boolean;
  background: string;
  ink: string;
  colors: Readonly<Record<string, string>>;
  opacity: number;
  strokeScale: number;
}
export function createEditorIconAppearance(dark = false): EditorIconAppearance {
  return {
    dark,
    background: dark ? '#292929' : '#ffffff',
    ink: dark ? '#f5f5f5' : '#202020',
    colors: {},
    opacity: 1,
    strokeScale: 1,
  };
}
const presentations = new WeakMap<EditorVectorDefinition, Map<string, EditorVectorPresentation>>();

function resolvePresentationPalette(
  definition: EditorVectorDefinition,
  settings: EditorIconAppearance
): Record<string, string> {
  const colors: Record<string, string> = {};
  const visibleSlots = definition.slots.filter((slot) => getColorAlpha(slot.originalColor) !== 0);
  const first = visibleSlots[0]?.originalColor.slice(0, 7);
  const monochrome =
    definition.capabilities.palette &&
    first !== undefined &&
    visibleSlots.every(
      (slot) => isEditorVectorColor(slot.originalColor) && slot.originalColor.slice(0, 7) === first
    );
  if (monochrome) {
    for (const slot of definition.slots) {
      const color = replaceColorChannels(slot.originalColor, settings.ink);
      if (color && isEditorVectorColor(color)) colors[slot.id] = color;
    }
  }
  for (const slot of definition.slots) {
    const replacement = settings.colors[slot.originalColor];
    if (replacement && isEditorVectorColor(replacement)) {
      const color = replaceColorChannels(slot.originalColor, replacement);
      if (color && isEditorVectorColor(color)) colors[slot.id] = color;
    }
  }
  return colors;
}

function renderPresentationSvg(
  definition: EditorVectorDefinition,
  colors: Readonly<Record<string, string>>,
  opacity: number,
  strokeScale: number
): string {
  let svg = definition.svg;
  if (Object.keys(colors).length > 0 || opacity !== 1 || strokeScale !== 1) {
    // Definitions have already passed SVG admission. Only their validated paint bindings change.
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    for (const slot of definition.slots) {
      const color = colors[slot.id];
      if (!color) continue;
      for (const binding of slot.bindings) {
        document.getElementById(binding.nodeId)?.setAttribute(binding.attribute, color);
      }
    }
    const root = document.documentElement;
    root.setAttribute('opacity', String(Number(root.getAttribute('opacity') ?? 1) * opacity));
    if (strokeScale !== 1) {
      for (const shape of Array.from(
        root.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline')
      )) {
        let node: Element | null = shape;
        while (node && !node.hasAttribute('stroke-width')) node = node.parentElement;
        shape.setAttribute(
          'stroke-width',
          String(Number(node?.getAttribute('stroke-width') ?? 1) * strokeScale)
        );
      }
    }
    svg = new XMLSerializer().serializeToString(document);
  }
  return svg;
}

/** Theme only monochrome artwork; canonical alpha and multicolor palettes stay intact. */
export function getEditorVectorPresentation(
  definition: EditorVectorDefinition,
  appearance: boolean | EditorIconAppearance = false
): EditorVectorPresentation {
  const settings =
    typeof appearance === 'boolean' ? createEditorIconAppearance(appearance) : appearance;
  const key = JSON.stringify(settings);
  let themes = presentations.get(definition);
  const cached = themes?.get(key);
  if (cached) return cached;
  if (!themes) {
    themes = new Map();
    presentations.set(definition, themes);
  }
  const colors = resolvePresentationPalette(definition, settings);
  const strokeScale = definition.capabilities.strokeScale ? settings.strokeScale : 1;
  const svg = renderPresentationSvg(definition, colors, settings.opacity, strokeScale);
  const presentation = {
    colors: Object.freeze(colors),
    opacity: settings.opacity,
    strokeScale,
    previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
  if (themes.size >= 24) themes.clear();
  themes.set(key, presentation);
  return presentation;
}
