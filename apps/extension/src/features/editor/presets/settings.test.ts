import { describe, expect, it } from 'vitest';

import {
  sanitizeEditorComparableSettings,
  sanitizeEditorPresetSettings,
  sanitizeEditorShapeComparableSettings,
} from './settings';

function createEllipseSettings() {
  return {
    borderPresetId: 'border-1',
    customCss: 'outline: 1px solid red;',
    fillColor: '#ffffff',
    fillOpacity: 0.25,
    inheritCustomCss: true,
    opacity: 0.4,
    radius: 8,
    shadow: 30,
    strokeColor: '#111111',
    strokeOpacity: 0.7,
    strokeStyle: 'dashed' as const,
    strokeWidth: 4,
  };
}

function expectSanitizedEllipseSettings() {
  expect(sanitizeEditorPresetSettings('ellipse', createEllipseSettings())).toEqual({
    borderPresetId: 'border-1',
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 0.25,
    inheritCustomCss: false,
    opacity: 0.7,
    radius: 0,
    shadow: 30,
    strokeColor: '#111111',
    strokeOpacity: 0.7,
    strokeStyle: 'dashed',
    strokeWidth: 4,
  });
}

function expectComparableShapeSettings() {
  expect(sanitizeEditorShapeComparableSettings(createEllipseSettings())).toEqual({
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 0.25,
    inheritCustomCss: false,
    opacity: 0.7,
    radius: 8,
    shadow: 30,
    strokeColor: '#111111',
    strokeOpacity: 0.7,
    strokeStyle: 'dashed',
    strokeWidth: 4,
  });
}

function expectComparableTransparentFillSettings() {
  expect(
    sanitizeEditorShapeComparableSettings({
      ...createEllipseSettings(),
      fillColor: '#00000000',
      fillOpacity: 0,
    })
  ).toEqual(
    expect.objectContaining({
      borderPresetId: null,
      fillColor: 'transparent',
      fillOpacity: 0,
    })
  );
}

function expectComparableEllipseFamilySettings() {
  expect(
    sanitizeEditorComparableSettings('ellipse', {
      ...createEllipseSettings(),
      fillColor: '#00000000',
      fillOpacity: 0,
    })
  ).toEqual(
    expect.objectContaining({
      borderPresetId: null,
      fillColor: 'transparent',
      fillOpacity: 0,
      customCss: '',
      inheritCustomCss: false,
      radius: 0,
    })
  );
}

function expectComparableEllipseRadiusNormalization() {
  expect(
    sanitizeEditorComparableSettings('ellipse', {
      ...createEllipseSettings(),
      radius: 18,
    })
  ).toEqual(
    expect.objectContaining({
      borderPresetId: null,
      radius: 0,
    })
  );
}

function expectUnchangedArrowSettings() {
  expect(
    sanitizeEditorPresetSettings('arrow', {
      color: '#111111',
      endHead: 'triangle',
      mode: 'straight',
      opacity: 0.6,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 4,
    })
  ).toEqual({
    color: '#111111',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 0.6,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 4,
  });
}

describe('sanitizeEditorPresetSettings', () => {
  it(
    'drops custom css and normalizes shape opacity for editor-owned shape families',
    expectSanitizedEllipseSettings
  );

  it('drops preset-link metadata from shape comparable settings', expectComparableShapeSettings);

  it(
    'normalizes hidden fill color in shape comparable settings',
    expectComparableTransparentFillSettings
  );

  it('normalizes ellipse comparable family settings', expectComparableEllipseFamilySettings);

  it(
    'drops ellipse-only orphaned radius from comparable settings',
    expectComparableEllipseRadiusNormalization
  );

  it('keeps non-shape families unchanged', expectUnchangedArrowSettings);
});
