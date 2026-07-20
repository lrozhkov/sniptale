import { vi } from 'vitest';

import type { BorderPreset } from '../../../../features/highlighter/contracts';
import { buildBorderPresetPreviewStyle } from './state/helpers';
import type { useBorderPresetEditorState } from './useBorderPresetEditorState';

export type BorderPresetEditorTestState = ReturnType<typeof useBorderPresetEditorState>;

const PREVIEW_STYLE = buildBorderPresetPreviewStyle({
  color: '#ffaa00',
  customCss: '',
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  radius: 8,
  shadow: 0,
  strokeOpacity: 100,
  style: 'solid',
  width: 2,
});

export function createBaseState(): BorderPresetEditorTestState {
  return {
    color: '#ffaa00',
    cssError: null,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    isResizing: false,
    strokeOpacity: 100,
    handleResizeStart: vi.fn(),
    handleSave: vi.fn(),
    hasBlockedProps: false,
    name: 'Preset',
    opacity: 90,
    padding: { top: 2, right: 2, bottom: 2, left: 2 },
    previewStyle: PREVIEW_STYLE,
    radius: 8,
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
    setStrokeOpacity: vi.fn(),
    setTextareaHeight: vi.fn(),
    setWidth: vi.fn(),
    shadow: 0,
    style: 'solid',
    textareaHeight: 72,
    updatePadding: vi.fn(),
    width: 3,
  };
}

export function createPreset(): BorderPreset {
  return {
    id: 'preset-2',
    name: 'Existing',
    isSystemDefault: false,
    order: 1,
    width: 4,
    color: '#ffaa00',
    style: 'dashed',
    radius: 10,
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: 30,
    opacity: 70,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
  };
}
