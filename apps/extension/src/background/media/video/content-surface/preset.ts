import { loadVideoUiState } from '../../../../composition/persistence/capture-settings';
import type { Settings } from '../../../../contracts/settings';

export function resolveVideoRecordingViewportPreset(settings: Settings): Promise<string | null> {
  return loadVideoUiState().then((videoUiState) => {
    const presets = settings.viewportPresets ?? [];
    const preferredPresetId = videoUiState.viewportPresetId;
    const resolvedPresetId = presets.some(
      (preset) => preset.id === preferredPresetId && preset.enabled
    )
      ? preferredPresetId
      : null;
    return presets.find((entry) => entry.id === resolvedPresetId)?.id ?? null;
  });
}
