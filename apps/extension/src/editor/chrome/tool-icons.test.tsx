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

function registerToolOrderTest() {
  it('keeps the canonical toolbar order', () => {
    expect(TOOL_ORDER).toEqual([
      'select',
      'pencil',
      'highlighter',
      'blur',
      'text',
      'callout',
      'arrow',
      'line',
      'shapes-and-lines',
      'step',
    ] satisfies EditorTool[]);
    expect(RASTER_TOOL_ORDER).toEqual([
      'selection',
      'brush',
      'eraser',
      'fill',
    ] satisfies EditorTool[]);
  });
}

function registerToolLabelTests() {
  it('maps every known tool label through i18n', () => {
    expect(getToolLabel('select')).toBe('editor.tools.select');
    expect(getToolLabel('selection')).toBe('editor.tools.selection');
    expect(getToolLabel('brush')).toBe('editor.tools.brush');
    expect(getToolLabel('eraser')).toBe('editor.tools.eraser');
    expect(getToolLabel('fill')).toBe('editor.tools.fill');
    expect(getToolLabel('pencil')).toBe('editor.tools.pencil');
    expect(getToolLabel('highlighter')).toBe('editor.tools.highlighter');
    expect(getToolLabel('shapes-and-lines')).toBe('editor.tools.shapesAndLines');
    expect(getToolLabel('rough-shape')).toBe('editor.tools.roughShape');
    expect(getToolLabel('shape-library')).toBe('editor.tools.shapeLibrary');
    expect(getToolLabel('rectangle')).toBe('editor.tools.rectangle');
    expect(getToolLabel('ellipse')).toBe('editor.tools.ellipse');
    expect(getToolLabel('blur')).toBe('editor.tools.blur');
    expect(getToolLabel('diamond')).toBe('editor.tools.diamond');
    expect(getToolLabel('arrow')).toBe('editor.tools.arrow');
    expect(getToolLabel('line')).toBe('editor.tools.line');
    expect(getToolLabel('callout')).toBe('editor.tools.callout');
    expect(getToolLabel('text')).toBe('editor.tools.text');
    expect(getToolLabel('step')).toBe('editor.tools.step');
    expect(getToolLabel('image')).toBe('editor.tools.image');
    expect(getToolLabel('crop')).toBe('editor.tools.crop');
  });

  it('falls back to the runtime tool identifier for unsupported values', () => {
    expect(getToolLabel('custom-tool' as EditorTool)).toBe('custom-tool');
  });
}

function registerObjectMappingTests() {
  it('maps object types to canonical tools', () => {
    expect(mapObjectTypeToTool('pencil')).toBe('pencil');
    expect(mapObjectTypeToTool('highlighter')).toBe('highlighter');
    expect(mapObjectTypeToTool('rectangle')).toBe('rectangle');
    expect(mapObjectTypeToTool('ellipse')).toBe('ellipse');
    expect(mapObjectTypeToTool('blur')).toBe('blur');
    expect(mapObjectTypeToTool('diamond')).toBe('diamond');
    expect(mapObjectTypeToTool('arrow')).toBe('arrow');
    expect(mapObjectTypeToTool('line')).toBe('line');
    expect(mapObjectTypeToTool('text')).toBe('text');
    expect(mapObjectTypeToTool('step')).toBe('step');
    expect(mapObjectTypeToTool('image')).toBe('image');
    expect(mapObjectTypeToTool('rich-shape')).toBe('shapes-and-lines');
    expect(mapObjectTypeToTool('source-image')).toBe('image');
    expect(mapObjectTypeToTool('background')).toBe('select');
    expect(mapObjectTypeToTool('meta-stamp')).toBe('text');
    expect(mapObjectTypeToTool('unknown-object' as EditorObjectType)).toBe('select');
    expect(mapObjectTypeToTool(null)).toBe('select');
  });
}

function registerLayerIconTests() {
  it('returns valid layer icons for specialized and delegated object types', () => {
    expect(React.isValidElement(TOOL_ICONS.selection)).toBe(true);
    expect(renderToStaticMarkup(<>{TOOL_ICONS.selection}</>)).toContain('M5 3a2 2 0 0 0-2 2');
    expect(React.isValidElement(TOOL_ICONS.brush)).toBe(true);
    expect(React.isValidElement(TOOL_ICONS.eraser)).toBe(true);
    expect(React.isValidElement(TOOL_ICONS.fill)).toBe(true);
    expect(React.isValidElement(TOOL_ICONS['shapes-and-lines'])).toBe(true);
    expect(React.isValidElement(TOOL_ICONS.line)).toBe(true);
    expect(React.isValidElement(TOOL_ICONS.callout)).toBe(true);
    expect(React.isValidElement(getLayerIcon('transparent-base'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('background'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('browser-frame'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('image'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('source-image'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('meta-stamp'))).toBe(true);
    expect(React.isValidElement(getLayerIcon('rich-shape'))).toBe(true);
    expect(getLayerIcon('rectangle')).toEqual(TOOL_ICONS.rectangle);
    expect(getLayerIcon('line')).toEqual(TOOL_ICONS.line);
    expect(getLayerIcon('meta-stamp')).not.toEqual(TOOL_ICONS.text);
  });

  it('keeps a default layer icon for unsupported runtime object identifiers', () => {
    expect(getLayerIcon('custom-object' as EditorObjectType)).toEqual(TOOL_ICONS.select);
  });
}

function runToolIconsSuite() {
  registerToolOrderTest();
  registerToolLabelTests();
  registerObjectMappingTests();
  registerLayerIconTests();
}

describe('tool-icons', runToolIconsSuite);
