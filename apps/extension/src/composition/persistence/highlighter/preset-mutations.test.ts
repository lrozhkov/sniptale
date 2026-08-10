import { describe, expect, it } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../features/highlighter/contracts';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import {
  addUserBorderPreset,
  deleteUserBorderPreset,
  reorderPresets,
  resetSystemBorderPresetToCanonical,
  setPresetAsDefault,
  setPresetEnabled,
  updateExistingBorderPreset,
} from './preset-mutations';

function createUserPreset(id = 'user-1'): BorderPreset {
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...base
  } = createDefaultHighlighterSettings().borderPresets[0]!;
  return { ...base, id, name: id, origin: 'user' };
}

function withOnlyPreset(preset: BorderPreset): HighlighterSettings {
  return {
    ...createDefaultHighlighterSettings(),
    borderPresets: [preset],
    defaultBorderPresetId: preset.id,
  };
}

describe('highlighter preset mutation guards', () => {
  it('rejects duplicate, missing, system-delete, and last-enabled mutations', () => {
    const settings = createDefaultHighlighterSettings();
    const system = settings.borderPresets[0]!;

    expect(addUserBorderPreset(settings, { ...system })).toBeNull();
    expect(updateExistingBorderPreset(settings, createUserPreset('missing'))).toBeNull();
    expect(deleteUserBorderPreset(settings, 'missing')).toBeNull();
    expect(deleteUserBorderPreset(settings, system.id)).toBeNull();
    expect(deleteUserBorderPreset(withOnlyPreset(createUserPreset()), 'user-1')).toBeNull();
    expect(
      deleteUserBorderPreset(
        {
          ...settings,
          borderPresets: [
            ...settings.borderPresets.map((preset) => ({ ...preset, enabled: false })),
            createUserPreset(),
          ],
          defaultBorderPresetId: 'user-1',
        },
        'user-1'
      )
    ).toBeNull();
    expect(setPresetEnabled(settings, 'missing', false)).toBeNull();
    expect(setPresetEnabled(settings, system.id, true)).toBeNull();
    expect(setPresetEnabled(withOnlyPreset(system), system.id, false)).toBeNull();
  });

  it('rejects invalid/default no-ops and preserves unchanged ordering', () => {
    const settings = createDefaultHighlighterSettings();
    const disabled = { ...settings.borderPresets[1]!, enabled: false };
    const withDisabled = {
      ...settings,
      borderPresets: [settings.borderPresets[0]!, disabled, ...settings.borderPresets.slice(2)],
    };

    expect(setPresetAsDefault(settings, 'missing')).toBeNull();
    expect(setPresetAsDefault(withDisabled, disabled.id)).toBeNull();
    expect(setPresetAsDefault(settings, settings.defaultBorderPresetId)).toBeNull();
    expect(
      reorderPresets(
        settings,
        settings.borderPresets.map((preset) => preset.id)
      )
    ).toBeNull();
  });

  it('does not rewrite unchanged user or system presets', () => {
    const settings = createDefaultHighlighterSettings();
    const system = settings.borderPresets[0]!;
    const userSettings = withOnlyPreset(createUserPreset());
    const user = userSettings.borderPresets[0]!;

    expect(
      updateExistingBorderPreset(settings, {
        ...system,
        name: getBorderPresetDisplayName(system),
      })
    ).toBeNull();
    expect(updateExistingBorderPreset(userSettings, { ...user })).toBeNull();
    expect(resetSystemBorderPresetToCanonical(settings, 'missing')).toBeNull();
    expect(resetSystemBorderPresetToCanonical(userSettings, user.id)).toBeNull();
    expect(resetSystemBorderPresetToCanonical(settings, system.id)).toBeNull();
    const tagged = updateExistingBorderPreset(settings, {
      ...system,
      name: getBorderPresetDisplayName(system),
      tagIds: ['tag-one'],
    })!;
    expect(resetSystemBorderPresetToCanonical(tagged, system.id)?.borderPresets[0]!.tagIds).toEqual(
      []
    );
  });

  it('freezes the localized system name when a visual edit supplies a blank name', () => {
    const settings = createDefaultHighlighterSettings();
    const system = settings.borderPresets[0]!;
    const result = updateExistingBorderPreset(settings, {
      ...system,
      color: '#010203',
      name: '   ',
      padding: { ...system.padding, left: system.padding.left + 1 },
    });

    expect(result?.borderPresets[0]).toMatchObject({
      color: '#010203',
      customized: true,
      name: expect.stringMatching(/\S/u),
      origin: 'system',
    });
  });

  it('treats the literal system key as an explicit rename from the localized name', () => {
    const settings = createDefaultHighlighterSettings();
    const system = settings.borderPresets[0]!;
    const result = updateExistingBorderPreset(settings, { ...system, name: system.id });

    expect(result?.borderPresets[0]).toMatchObject({
      customized: true,
      name: 'system-default',
      origin: 'system',
    });
  });
});
