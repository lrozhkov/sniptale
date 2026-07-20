import { describe, expect, it } from 'vitest';
import type { EditorFrameSettings } from '../../../../../features/editor/document/types';
import { doesFrameGeometryChange } from './frame-geometry';

function createFrame(overrides: Partial<EditorFrameSettings> = {}): EditorFrameSettings {
  return {
    backgroundColor: '#fff',
    backgroundGradientAngle: 90,
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#ddd',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'expand-canvas',
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 16,
    ...overrides,
  };
}

describe('scene resize frame geometry detection', () => {
  it('ignores visual-only frame changes', () => {
    expect(doesFrameGeometryChange(createFrame(), createFrame({ backgroundColor: '#000' }))).toBe(
      false
    );
  });

  it('detects layout and padding changes', () => {
    expect(doesFrameGeometryChange(createFrame(), createFrame({ layoutMode: 'fit-image' }))).toBe(
      true
    );
    expect(doesFrameGeometryChange(createFrame(), createFrame({ paddingLeft: 32 }))).toBe(true);
  });
});
