import { useCallback, useEffect, useState } from 'react';
import type { EditorInspectorPresetViewMode } from './types';
import { runWithPersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';

const STORAGE_PREFIX = 'sniptale-editor-inspector-template-view:';
const DEFAULT_VIEW_MODE: EditorInspectorPresetViewMode = 'parameters';

function parseViewMode(value: unknown): EditorInspectorPresetViewMode {
  return value === 'templates' || value === 'parameters' ? value : DEFAULT_VIEW_MODE;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getEditorInspectorTemplateViewStorageKey(owner: string): string {
  return `${STORAGE_PREFIX}${owner}`;
}

export function readEditorInspectorTemplateViewMode(owner: string): EditorInspectorPresetViewMode {
  const storage = getLocalStorage();
  if (!storage) {
    return DEFAULT_VIEW_MODE;
  }

  try {
    return parseViewMode(storage.getItem(getEditorInspectorTemplateViewStorageKey(owner)));
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export function writeEditorInspectorTemplateViewMode(
  owner: string,
  viewMode: EditorInspectorPresetViewMode
): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) {
    return Promise.resolve();
  }

  return runWithPersistenceMutationPermit(() => {
    try {
      storage.setItem(getEditorInspectorTemplateViewStorageKey(owner), viewMode);
    } catch {
      // Advisory UI state must fail soft.
    }
  });
}

export function useEditorInspectorTemplateViewMode(owner: string) {
  const [viewMode, setViewMode] = useState<EditorInspectorPresetViewMode>(() =>
    readEditorInspectorTemplateViewMode(owner)
  );

  useEffect(() => {
    setViewMode(readEditorInspectorTemplateViewMode(owner));
  }, [owner]);

  const setPersistentViewMode = useCallback(
    (nextViewMode: EditorInspectorPresetViewMode) => {
      setViewMode(nextViewMode);
      void writeEditorInspectorTemplateViewMode(owner, nextViewMode);
    },
    [owner]
  );

  return {
    viewMode,
    setViewMode: setPersistentViewMode,
  };
}
