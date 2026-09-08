import { expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_PREFERENCES, parseWorkspacePreferences } from './workspace-preferences';

it('restores only valid layout values and discards invalid dimensions and unknown fields', () => {
  expect(
    parseWorkspacePreferences({
      inspectorPresentation: 'all',
      materialsFullHeight: true,
      activeLibrary: null,
      materialsWidth: 300,
      inspectorWidth: Infinity,
      previewHeight: -12,
      inspectorCollapsed: 'yes',
      project: { clips: [] },
    })
  ).toEqual({
    ...DEFAULT_WORKSPACE_PREFERENCES,
    inspectorPresentation: 'all',
    materialsFullHeight: true,
    activeLibrary: null,
    materialsWidth: 300,
  });
  for (const value of [null, false, [], 'all', 42])
    expect(parseWorkspacePreferences(value)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
  expect(
    parseWorkspacePreferences({ inspectorWidth: 450, previewHeight: 600 }).inspectorWidth
  ).toBe(450);
});
