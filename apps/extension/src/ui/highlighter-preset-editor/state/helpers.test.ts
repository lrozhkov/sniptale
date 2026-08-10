import { describe, expect, it, vi } from 'vitest';

import type { BorderPreset } from '../../../features/highlighter/contracts';
import {
  applyBorderPresetDraftState,
  buildBorderPresetPreviewStyle,
  resetBorderPresetDraftState,
} from './helpers';
import type { BorderPresetDraftSetters } from '../useBorderPresetEditorState/types';

vi.mock('../../../features/highlighter/css-sanitizer/css', () => ({
  validateCssPolicyString: vi.fn(() => ({ blockedProps: [], properties: [], rawError: false })),
  validateCssString: vi.fn((css: string) => ({
    blockedProps: [],
    hasBlockedProps: false,
    rawError: null,
    styles: css.includes('geometry-escape')
      ? {
          all: 'unset',
          backgroundImage: 'linear-gradient(red, blue)',
          border: '20px dashed blue',
          boxShadow: '0 0 4px red',
          clip: 'rect(0, 0, 0, 0)',
          outline: '1px solid red',
          WebkitTransform: 'scale(2)',
          zoom: '2',
        }
      : { outline: '1px solid red' },
  })),
}));

function createSetters() {
  return {
    setColor: vi.fn(),
    setCustomCss: vi.fn(),
    setFillPaint: vi.fn(),
    setEffects: vi.fn(),
    setInheritCustomCss: vi.fn(),
    setIsResizing: vi.fn(),
    setName: vi.fn(),
    setPadding: vi.fn(),
    setRadius: vi.fn(),
    setShadow: vi.fn(),
    setStyle: vi.fn(),
    setTextareaHeight: vi.fn(),
    setWidth: vi.fn(),
  } satisfies BorderPresetDraftSetters;
}

describe('border-preset-editor-state draft setters', () => {
  it('applies and resets draft state through setter seams', () => {
    const setters = createSetters();
    const preset: BorderPreset = {
      id: 'preset',
      name: 'Preset',
      order: 1,
      tagIds: [],
      width: 5,
      color: '#ff660080',
      style: 'dashed',
      radius: 9,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      shadow: 30,
      fillPaint: { kind: 'solid' as const, color: '#00ff0040' },
      inheritCustomCss: false,
      customCss: 'color: red;',
    };

    applyBorderPresetDraftState(preset, setters);
    resetBorderPresetDraftState(setters);

    expect(setters.setName).toHaveBeenNthCalledWith(1, 'Preset');
    expect(setters.setName).toHaveBeenNthCalledWith(2, '');
    expect(setters.setWidth).toHaveBeenNthCalledWith(1, 5);
    expect(setters.setWidth).toHaveBeenNthCalledWith(2, 3);
    expect(setters.setCustomCss).toHaveBeenNthCalledWith(1, 'color: red;');
    expect(setters.setCustomCss).toHaveBeenNthCalledWith(2, '');
    expect(setters.setInheritCustomCss).toHaveBeenNthCalledWith(1, true);
    expect(setters.setInheritCustomCss).toHaveBeenNthCalledWith(2, false);
  });
});

describe('border-preset-editor-state preview style', () => {
  it('builds a preview style and merges sanitized css styles', () => {
    const style = buildBorderPresetPreviewStyle({
      color: '#ff660080',
      customCss: 'outline: 1px solid red;',
      fillPaint: { kind: 'solid' as const, color: '#00ff0040' },
      inheritCustomCss: true,
      radius: 12,
      shadow: 100,
      style: 'solid',
      width: 4,
    });

    expect(style).toMatchObject({
      background: '#00ff0040',
      borderColor: '#ff660080',
      borderRadius: '12px',
      borderStyle: 'solid',
      borderWidth: '4px',
      boxShadow: '0 0 22px 4px color-mix(in srgb, #ff660080 78%, transparent)',
      height: '80px',
      opacity: 1,
      outline: '1px solid red',
      width: '80px',
    });
  });

  it('keeps canonical preview geometry above accepted custom css', () => {
    const style = buildBorderPresetPreviewStyle({
      color: '#ff6600',
      customCss: 'geometry-escape',
      fillPaint: { kind: 'solid' as const, color: '#00ff00' },
      inheritCustomCss: true,
      radius: 12,
      shadow: 0,
      style: 'solid',
      width: 4,
    });

    expect(style).toMatchObject({
      backgroundImage: 'linear-gradient(red, blue)',
      boxShadow: '0 0 4px red',
      height: '80px',
      outline: '1px solid red',
      width: '80px',
    });
    expect(style).not.toHaveProperty('all');
    expect(style).not.toHaveProperty('border');
    expect(style).not.toHaveProperty('clip');
    expect(style).not.toHaveProperty('WebkitTransform');
    expect(style).not.toHaveProperty('zoom');
  });
});
