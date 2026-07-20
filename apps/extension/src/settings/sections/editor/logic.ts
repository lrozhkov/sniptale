import { useEffect, useState } from 'react';

import type {
  EditorPaletteSettings,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import {
  createDefaultEditorPresetStorageState,
  loadEditorPresetState,
  subscribeToEditorPresetState,
} from '../../../composition/persistence/editor-presets';
import {
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
  subscribeToHighlighterSettings,
} from '../../../composition/persistence/highlighter';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { EditorSettingsPaletteKey, EditorSettingsPresetOwner } from './families';

type BorderPresetState = {
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
};

function createDefaultBorderPresetState(): BorderPresetState {
  return {
    borderPresets: [DEFAULT_BORDER_PRESET],
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  };
}

function toBorderPresetState(settings: Awaited<ReturnType<typeof loadHighlighterSettings>>) {
  return {
    borderPresets: settings.borderPresets,
    defaultBorderPresetId: settings.defaultBorderPresetId,
  };
}

export function reorderItemIds(
  items: ReadonlyArray<{ id: string }>,
  draggedId: string,
  targetId: string
) {
  const nextItems = [...items];
  const draggedIndex = nextItems.findIndex((item) => item.id === draggedId);
  const targetIndex = nextItems.findIndex((item) => item.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return null;
  }

  const [draggedItem] = nextItems.splice(draggedIndex, 1);
  if (!draggedItem) {
    return null;
  }

  nextItems.splice(targetIndex, 0, draggedItem);
  return nextItems.map((item) => item.id);
}

export function updatePaletteOrder(args: {
  draggedIndex: number | null;
  palette: EditorPaletteSettings;
  paletteKey: EditorSettingsPaletteKey;
  targetIndex: number;
}) {
  if (args.draggedIndex === null || args.draggedIndex === args.targetIndex) {
    return null;
  }

  const nextColors = [...args.palette[args.paletteKey]];
  const [draggedColor] = nextColors.splice(args.draggedIndex, 1);
  if (!draggedColor) {
    return null;
  }

  nextColors.splice(args.targetIndex, 0, draggedColor);
  return {
    ...args.palette,
    [args.paletteKey]: nextColors,
  } satisfies EditorPaletteSettings;
}

export function getOwnerPresets(
  owner: EditorSettingsPresetOwner,
  editorPresetState: EditorPresetStorageState,
  borderPresetState: BorderPresetState
) {
  if (owner === 'rectangle') {
    return borderPresetState.borderPresets;
  }

  return editorPresetState[owner].presets;
}

export function getOwnerDefaultId(
  owner: EditorSettingsPresetOwner,
  editorPresetState: EditorPresetStorageState,
  borderPresetState: BorderPresetState
) {
  if (owner === 'rectangle') {
    return borderPresetState.defaultBorderPresetId;
  }

  return editorPresetState[owner].defaultPresetId;
}

export function usePresetStorageState() {
  const [editorPresetState, setEditorPresetState] = useState<EditorPresetStorageState>(() =>
    createDefaultEditorPresetStorageState()
  );
  const [borderPresetState, setBorderPresetState] = useState<BorderPresetState>(() =>
    createDefaultBorderPresetState()
  );

  useEffect(() => {
    let cancelled = false;
    const applyEditorState = (nextState: EditorPresetStorageState) => {
      if (!cancelled) {
        setEditorPresetState(nextState);
      }
    };
    const applyBorderState = (settings: Awaited<ReturnType<typeof loadHighlighterSettings>>) => {
      if (!cancelled) {
        setBorderPresetState(toBorderPresetState(settings));
      }
    };

    void loadEditorPresetState()
      .then(applyEditorState)
      .catch(() => undefined);
    void loadHighlighterSettings()
      .then(applyBorderState)
      .catch(() => undefined);
    const unsubscribeEditor = subscribeToEditorPresetState(applyEditorState);
    const unsubscribeBorder = subscribeToHighlighterSettings(applyBorderState);

    return () => {
      cancelled = true;
      unsubscribeEditor();
      unsubscribeBorder();
    };
  }, []);

  return { borderPresetState, editorPresetState };
}
