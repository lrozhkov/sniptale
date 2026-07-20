import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createCalloutEffects, createCalloutStyle } from './callout-style';

function createCalloutSettings() {
  return DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).callout;
}

it('maps callout style defaults and explicit shadow overrides into rich-shape style state', () => {
  const baseShape = createDefaultRichShapeObject();
  const settings = createCalloutSettings();

  expect(createCalloutStyle(baseShape, settings)).toEqual(
    expect.objectContaining({
      cornerRadius: settings.style.radius,
      fill: { type: 'solid', color: settings.style.fillColor },
      line: expect.objectContaining({ dashStyle: 'solid' }),
    })
  );
  expect(createCalloutEffects(baseShape, settings).shadow).toEqual(
    expect.objectContaining({
      enabled: settings.style.shadow > 0,
      opacity: settings.style.shadow > 0 ? 0.28 : 0,
    })
  );

  const shadow = createCalloutEffects(baseShape, {
    ...settings,
    style: {
      ...settings.style,
      shadow: 1,
      shadowAngle: 135,
      shadowBlur: 9,
      shadowColor: '#112233',
      shadowDistance: 14,
    },
  }).shadow;

  expect(shadow).toEqual(
    expect.objectContaining({
      angle: 135,
      blur: 9,
      color: '#112233',
      distance: 14,
      enabled: true,
      opacity: 0.28,
    })
  );
});
