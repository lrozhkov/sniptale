import { describe, expect, it, vi } from 'vitest';

import type { BorderPreset } from '../../../features/highlighter/contracts';
import {
  applyBorderPresetDraftState,
  buildBorderPresetPreviewStyle,
  resetBorderPresetDraftState,
} from './helpers';
import type { BorderPresetDraftSetters } from '../useBorderPresetEditorState/types';

vi.mock('../../../features/highlighter/css-sanitizer/css', () => ({
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
    setFillColor: vi.fn(),
    setFillOpacity: vi.fn(),
    setInheritCustomCss: vi.fn(),
    setIsResizing: vi.fn(),
    setName: vi.fn(),
    setOpacity: vi.fn(),
    setPadding: vi.fn(),
    setRadius: vi.fn(),
    setShadow: vi.fn(),
    setStyle: vi.fn(),
    setTextareaHeight: vi.fn(),
    setStrokeOpacity: vi.fn(),
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
      width: 5,
      color: '#ff6600',
      style: 'dashed',
      radius: 9,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      shadow: 30,
      opacity: 77,
      strokeOpacity: 66,
      fillColor: '#00ff00',
      fillOpacity: 35,
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
      color: '#ff6600',
      customCss: 'outline: 1px solid red;',
      fillColor: '#00ff00',
      fillOpacity: 25,
      inheritCustomCss: true,
      radius: 12,
      shadow: 100,
      strokeOpacity: 50,
      style: 'solid',
      width: 4,
    });

    expect(style).toMatchObject({
      backgroundColor: 'rgba(0, 255, 0, 0.25)',
      borderColor: 'rgba(255, 102, 0, 0.5)',
      borderRadius: '12px',
      borderStyle: 'solid',
      borderWidth: '4px',
      boxShadow: '0 0 22px 4px color-mix(in srgb, #ff6600 78%, transparent)',
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
      fillColor: '#00ff00',
      fillOpacity: 25,
      inheritCustomCss: true,
      radius: 12,
      shadow: 0,
      strokeOpacity: 50,
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
