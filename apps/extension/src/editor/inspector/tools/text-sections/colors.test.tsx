import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  renderTextBackgroundColorSection,
  renderTextBackgroundOpacityPanel,
  renderTextForegroundColorSection,
  renderTextOpacityPanel,
  renderTextShadowColorSection,
} from './colors';

function createProps() {
  return {
    applyTextPatch: vi.fn(),
    commitPendingSelectionSettings: vi.fn(),
    previewColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
    previewTextPatch: vi.fn(),
    recentColors: [],
    textBackgroundPalette: ['#ffffff'],
    textColorPalette: ['#111111'],
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  };
}

const settings = {
  backgroundColor: '#ffffff',
  backgroundOpacity: 0.4,
  textColor: '#111111',
  textOpacity: 0.8,
} as const;

describe('text color sections', () => {
  it('routes foreground, background, opacity, and shadow color patches', () => {
    const props = createProps();
    const text = renderTextForegroundColorSection(props as never, settings as never);
    const background = renderTextBackgroundColorSection(props as never, settings as never);
    const textOpacity = renderTextOpacityPanel(props as never, settings as never);
    const backgroundOpacity = renderTextBackgroundOpacityPanel(props as never, settings as never);
    const shadow = renderTextShadowColorSection(props as never, settings as never);
    const explicitShadow = renderTextShadowColorSection(
      props as never,
      {
        ...settings,
        shadowColor: '#555555',
      } as never
    );

    expect(shadow.props.value).toBe('#111111');
    expect(explicitShadow.props.value).toBe('#555555');
    text.props.onChange('#222222');
    background.props.onPreviewChange('#333333');
    textOpacity.props.onPreviewValue(140);
    backgroundOpacity.props.onPreviewValue(-1);
    shadow.props.onChange('#444444');

    expect(props.applyTextPatch).toHaveBeenCalledWith({ textColor: '#222222' });
    expect(props.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#333333' });
    expect(props.previewTextPatch).toHaveBeenCalledWith({ textOpacity: 1 });
    expect(props.previewTextPatch).toHaveBeenCalledWith({ backgroundOpacity: 0 });
    expect(props.applyTextPatch).toHaveBeenCalledWith({ shadowColor: '#444444' });
  });
});
