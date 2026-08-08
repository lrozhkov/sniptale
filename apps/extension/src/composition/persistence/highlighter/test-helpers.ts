export function createPreset(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Preset ${id}`,
    order: 0,
    width: 3,
    color: '#ff0000',
    style: 'solid' as const,
    radius: 0,
    padding: { top: 3, left: 3, right: 3, bottom: 3 },
    shadow: 0,
    fillColor: '#00000000',
    inheritCustomCss: false,
    customCss: '',
    origin: 'user' as const,
    ...overrides,
  };
}

export function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    borderPresets: [createPreset('preset-1')],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border' as const,
    defaultBlurSettings: {
      amount: 10,
      blurType: 'gaussian' as const,
      borderPresetId: null,
      radius: 0,
      shadow: 0,
      showBorder: false,
      strokeColor: '#475569',
      strokeStyle: 'solid' as const,
      strokeWidth: 0,
    },
    defaultFocusSettings: {
      opacity: 0.5,
      showBorder: false,
    },
    systemPresetCatalogRevision: 1,
    catalogCustomized: true,
    ...overrides,
  };
}

export function createStoredSettings() {
  return {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2', { order: 1 })],
      defaultBorderPresetId: 'preset-2',
    }),
  };
}
