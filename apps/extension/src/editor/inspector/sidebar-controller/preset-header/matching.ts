type PresetWithEnabled = {
  enabled?: boolean;
  id: string;
};

export function getPresetSettingsSignature(settings: unknown): string {
  if (Array.isArray(settings)) {
    return `[${settings.map((item) => getPresetSettingsSignature(item)).join(',')}]`;
  }

  if (settings && typeof settings === 'object') {
    return `{${Object.keys(settings)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${getPresetSettingsSignature(settings[key as keyof typeof settings])}`
      )
      .join(',')}}`;
  }

  return JSON.stringify(settings);
}

export function getEnabledPresets<TPreset extends PresetWithEnabled>(
  presets: readonly TPreset[]
): TPreset[] {
  return presets.filter((preset) => preset.enabled !== false);
}

export function findMatchingPreset<TPreset extends PresetWithEnabled, TSettings>(args: {
  currentSettings: TSettings;
  getPresetSettings: (preset: TPreset) => TSettings;
  presets: readonly TPreset[];
}): TPreset | undefined {
  const currentSignature = getPresetSettingsSignature(args.currentSettings);

  return getEnabledPresets(args.presets).find(
    (preset) => getPresetSettingsSignature(args.getPresetSettings(preset)) === currentSignature
  );
}
