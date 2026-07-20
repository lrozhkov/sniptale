import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import {
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
} from '../../../composition/persistence/highlighter';
import { loadEditorPresetState } from '../../../composition/persistence/editor-presets';
import {
  DEFAULT_EDITOR_WORKSPACE_DEFAULTS,
  loadEditorWorkspaceDefaults,
  type EditorWorkspaceDefaults,
} from '../../persistence/workspace';

type EditorPageDefaults = {
  borderPreset?: typeof DEFAULT_BORDER_PRESET;
  toolSettings?: Partial<EditorToolSettings>;
};

function resolveDefaultBorderPreset(
  settings: Awaited<ReturnType<typeof loadHighlighterSettings>>
): typeof DEFAULT_BORDER_PRESET {
  return (
    settings.borderPresets.find(
      (item) => item.id === settings.defaultBorderPresetId && item.enabled !== false
    ) ?? DEFAULT_BORDER_PRESET
  );
}

function resolveDefaultToolSettings(
  state: Awaited<ReturnType<typeof loadEditorPresetState>>
): Partial<EditorToolSettings> {
  const toolSettings: Partial<EditorToolSettings> = {};
  const pencil = state.pencil.presets.find((preset) => preset.id === state.pencil.defaultPresetId);
  const highlighter = state.highlighter.presets.find(
    (preset) => preset.id === state.highlighter.defaultPresetId
  );
  const ellipse = state.ellipse.presets.find(
    (preset) => preset.id === state.ellipse.defaultPresetId
  );
  const blur = state.blur.presets.find((preset) => preset.id === state.blur.defaultPresetId);
  const arrow = state.arrow.presets.find((preset) => preset.id === state.arrow.defaultPresetId);
  const text = state.text.presets.find((preset) => preset.id === state.text.defaultPresetId);
  const step = state.step.presets.find((preset) => preset.id === state.step.defaultPresetId);

  if (pencil) {
    toolSettings.pencil = pencil.settings;
  }
  if (highlighter) {
    toolSettings.highlighter = highlighter.settings;
  }
  if (ellipse) {
    toolSettings.ellipse = ellipse.settings;
  }
  if (blur) {
    toolSettings.blur = blur.settings;
  }
  if (arrow) {
    toolSettings.arrow = arrow.settings;
  }
  if (text) {
    toolSettings.text = text.settings;
  }
  if (step) {
    toolSettings.step = step.settings;
  }

  return toolSettings;
}

function loadEditorPageToolDefaults(hydrateDefaults: (options?: EditorPageDefaults) => void): void {
  Promise.all([loadHighlighterSettings(), loadEditorPresetState()])
    .then(([highlighterSettings, editorPresetState]) => {
      const nextDefaults: Required<Pick<EditorPageDefaults, 'borderPreset' | 'toolSettings'>> = {
        borderPreset: resolveDefaultBorderPreset(highlighterSettings),
        toolSettings: resolveDefaultToolSettings(editorPresetState),
      };

      hydrateDefaults(nextDefaults);
    })
    .catch(() => hydrateDefaults({ borderPreset: DEFAULT_BORDER_PRESET }));
}

function loadEditorPageWorkspaceDefaults(
  hydrateWorkspaceDefaults: (defaults: EditorWorkspaceDefaults) => void
): void {
  loadEditorWorkspaceDefaults()
    .then(hydrateWorkspaceDefaults)
    .catch(() => hydrateWorkspaceDefaults(DEFAULT_EDITOR_WORKSPACE_DEFAULTS));
}

export function loadEditorPageDefaults(
  hydrateDefaults: (options?: EditorPageDefaults) => void,
  hydrateWorkspaceDefaults: (defaults: EditorWorkspaceDefaults) => void
): void {
  loadEditorPageToolDefaults(hydrateDefaults);
  loadEditorPageWorkspaceDefaults(hydrateWorkspaceDefaults);
}
