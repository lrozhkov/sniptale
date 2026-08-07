// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  CONTENT_UI_SCALE_PROPERTY,
  projectClientPointToContentUi,
  projectClientRectToContentUi,
  projectContentUiPointToClient,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
  resolveContentUiScaleCompensation,
} from './scale';

it('resolves and reads the shared visual compensation contract', () => {
  expect(
    resolveContentUiScaleCompensation({
      baselineDevicePixelRatio: 1,
      currentDevicePixelRatio: 2,
    })
  ).toBe(0.5);

  const owner = document.createElement('div');
  owner.style.setProperty(CONTENT_UI_SCALE_PROPERTY, '0.5');
  const child = document.createElement('button');
  owner.append(child);
  document.body.append(owner);
  expect(readContentUiScaleCompensation(child)).toBe(0.5);
});

it('projects client geometry into a zoom-independent content UI viewport', () => {
  expect(resolveContentUiViewport({ clientHeight: 600, clientWidth: 900, scale: 0.5 })).toEqual({
    height: 1200,
    width: 1800,
  });
  expect(projectClientPointToContentUi({ x: 100, y: 50 }, 0.5)).toEqual({ x: 200, y: 100 });
  expect(projectContentUiPointToClient({ x: 200, y: 100 }, 0.5)).toEqual({ x: 100, y: 50 });
  expect(projectClientRectToContentUi({ x: 10, y: 20, width: 80, height: 40 }, 0.5)).toEqual({
    x: 20,
    y: 40,
    width: 160,
    height: 80,
  });
});
