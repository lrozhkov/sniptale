// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEditorInspectorTemplateViewStorageKey,
  readEditorInspectorTemplateViewMode,
  writeEditorInspectorTemplateViewMode,
  useEditorInspectorTemplateViewMode,
} from './view-mode';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('editor inspector template view mode storage', () => {
  it('defaults to parameters and restores valid templates values', () => {
    expect(readEditorInspectorTemplateViewMode('arrow')).toBe('parameters');

    localStorage.setItem(getEditorInspectorTemplateViewStorageKey('arrow'), 'templates');

    expect(readEditorInspectorTemplateViewMode('arrow')).toBe('templates');
  });

  it('ignores invalid values and keeps owner keys separate', () => {
    localStorage.setItem(getEditorInspectorTemplateViewStorageKey('arrow'), 'invalid');
    localStorage.setItem(getEditorInspectorTemplateViewStorageKey('sceneBackground'), 'templates');

    expect(readEditorInspectorTemplateViewMode('arrow')).toBe('parameters');
    expect(readEditorInspectorTemplateViewMode('sceneBackground')).toBe('templates');
  });

  it('writes values and fails soft when localStorage throws', async () => {
    await writeEditorInspectorTemplateViewMode('arrow', 'templates');

    expect(localStorage.getItem(getEditorInspectorTemplateViewStorageKey('arrow'))).toBe(
      'templates'
    );

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('read failed');
        },
        setItem: () => {
          throw new Error('write failed');
        },
      },
    });

    expect(readEditorInspectorTemplateViewMode('arrow')).toBe('parameters');
    await expect(
      writeEditorInspectorTemplateViewMode('arrow', 'templates')
    ).resolves.toBeUndefined();
  });
});

describe('editor inspector template view mode hook', () => {
  it('does nothing when local storage is unavailable', async () => {
    vi.stubGlobal('window', undefined);

    await expect(
      writeEditorInspectorTemplateViewMode('arrow', 'templates')
    ).resolves.toBeUndefined();
  });

  it('persists changes made through the view-mode hook', async () => {
    let hook: ReturnType<typeof useEditorInspectorTemplateViewMode> | null = null;
    const container = document.createElement('div');
    const root = createRoot(container);
    const Harness = () => {
      hook = useEditorInspectorTemplateViewMode('arrow');
      return null;
    };

    await act(async () => root.render(createElement(Harness)));
    await act(async () => hook?.setViewMode('templates'));

    expect(localStorage.getItem(getEditorInspectorTemplateViewStorageKey('arrow'))).toBe(
      'templates'
    );
    act(() => root.unmount());
  });
});
