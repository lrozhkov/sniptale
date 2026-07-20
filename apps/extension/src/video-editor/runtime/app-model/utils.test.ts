// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

import { buildVideoEditorUrl, getSaveStateMeta, isEditableTarget } from './utils';

describe('video editor app-model utilities', () => {
  beforeEach(() => {
    translateMock.mockClear();
    window.history.replaceState({}, '', '/video-editor.html');
  });

  it('builds project URLs with an optional recording id', () => {
    expect(buildVideoEditorUrl('project 1', null)).toBe('/video-editor.html?project=project+1');
    expect(buildVideoEditorUrl('project 1', 'recording/2')).toBe(
      '/video-editor.html?project=project+1&id=recording%2F2'
    );
  });

  it.each([
    ['idle', 'common.states.draft'],
    ['saving', 'common.states.saving'],
    ['saved', 'common.states.saved'],
    ['error', 'common.states.error'],
  ] as const)('maps %s save state to translated shell metadata', (state, label) => {
    expect(getSaveStateMeta(state)).toEqual(
      expect.objectContaining({ label, className: expect.any(String) })
    );
  });

  it('distinguishes editable text controls from non-text controls and ordinary elements', () => {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const textarea = document.createElement('textarea');
    const editableOwner = document.createElement('div');
    editableOwner.setAttribute('contenteditable', 'true');
    const editableChild = editableOwner.appendChild(document.createElement('span'));

    expect(isEditableTarget(textInput)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(editableChild)).toBe(true);
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
