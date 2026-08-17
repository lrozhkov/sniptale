import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EditorObjectType, EditorTool } from '../../features/editor/document/types';
import {
  RASTER_TOOL_ORDER,
  TOOL_ICONS,
  TOOL_ORDER,
  getLayerIcon,
  getToolLabel,
  mapObjectTypeToTool,
} from './tool-icons';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

describe('tool-icons', () => {
  it('exposes only the current vector drawing tools in canonical order', () => {
    expect(TOOL_ORDER).toEqual([
      'select',
      'pencil',
      'marker',
      'frame-annotation',
      'shape',
      'blur',
      'text',
      'arrow',
      'step',
    ] satisfies EditorTool[]);
    expect(RASTER_TOOL_ORDER).toEqual([]);
  });

  it('maps every current drawing object to its tool and label', () => {
    const cases: Array<[EditorObjectType, EditorTool]> = [
      ['pencil', 'pencil'],
      ['marker', 'marker'],
      ['shape', 'shape'],
      ['blur', 'blur'],
      ['arrow', 'arrow'],
      ['text', 'text'],
      ['rich-shape', 'shape'],
      ['meta-stamp', 'text'],
    ];
    for (const [objectType, tool] of cases) {
      expect(mapObjectTypeToTool(objectType)).toBe(tool);
      expect(React.isValidElement(getLayerIcon(objectType))).toBe(true);
      expect(getToolLabel(tool)).toMatch(/^editor\.tools\./);
    }
    expect(mapObjectTypeToTool(null)).toBe('select');
    expect(mapObjectTypeToTool('unknown' as EditorObjectType)).toBe('select');
  });

  it('renders an icon for every supported tool', () => {
    for (const tool of Object.keys(TOOL_ICONS) as EditorTool[]) {
      expect(renderToStaticMarkup(<>{TOOL_ICONS[tool]}</>)).toContain('<svg');
    }
    expect(renderToStaticMarkup(<>{TOOL_ICONS.pencil}</>)).toContain('lucide-pen-line');
  });
});
