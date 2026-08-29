import { describe, expect, it } from 'vitest';
import {
  normalizeSettingsTransferRegistryField,
  projectSettingsTransferConflictNodeId,
} from './node-projection';

describe('settings transfer canonical node projection', () => {
  it.each([
    ['interface.preferences', 'popupStartup', 'popup-startup'],
    ['interface.preferences', 'contextMenu', 'context-menu'],
    ['capture.viewport-presets', 'defaultId', 'default'],
    ['capture.video', 'qualityProfileId', 'selection'],
    ['capture.video', 'outputProfile', 'output'],
    ['capture.saving', 'defaultImagePresetId', 'defaults'],
    ['capture.saving', 'defaultVideoPresetId', 'defaults'],
    ['capture.saving', 'defaultExportPresetId', 'defaults'],
    ['styles.borders', 'defaultBorderPresetId', 'defaults'],
    ['styles.callouts', 'defaultPresetId', 'defaults'],
    ['styles.numbering', 'defaultPresetId', 'defaults'],
    ['styles.tags', 'activeFilterTagIds', 'active-filter'],
    ['ai.models', 'defaultModelId', 'default'],
    ['ai.prompt-templates', 'order', 'items'],
    ['capture.video', 'profiles', 'profiles'],
    ['capture.pages', 'resourceLimits', 'resourceLimits'],
  ])('maps %s.%s to the registry field %s', (domainId, field, expected) => {
    expect(normalizeSettingsTransferRegistryField(domainId, field)).toBe(expected);
  });

  it.each([
    ['styles.surfaces.presets.system-surface-plain', 'styles.surfaces.items.system-surface-plain'],
    ['capture.video.profiles.profile.a', 'capture.video.profiles.profile.a'],
    ['ai.prompt-templates.items.a.x', 'ai.prompt-templates.items.a.x'],
    [
      'styles.tool-presets.step.presets.family:item.with.dot',
      'styles.tool-presets.items.step:family:item.with.dot',
    ],
  ])('preserves the complete opaque item ID for %s', (path, expected) => {
    expect(projectSettingsTransferConflictNodeId(path, 'item')).toBe(expected);
  });

  it.each([
    ['styles.borders.defaultBorderPresetId', 'styles.borders.defaults'],
    ['styles.tags.activeFilterTagIds', 'styles.tags.active-filter'],
    ['styles.palettes.slots.slot-0', 'styles.palettes.items.slot-0'],
  ])('projects scalar conflict %s to %s', (path, expected) => {
    expect(projectSettingsTransferConflictNodeId(path, 'scalar')).toBe(expected);
  });
});
