import { describe, expect, it } from 'vitest';

import { isEditorSpaceKey, resolveEditorKeyboardAction } from './keyboard';

function createKeyboardOptions(
  overrides: Partial<Parameters<typeof resolveEditorKeyboardAction>[0]>
) {
  return {
    altKey: false,
    activeTool: 'select',
    code: 'KeyZ',
    ctrlKey: false,
    hasCanvas: true,
    hasCropGuide: false,
    hasDrawSession: false,
    hasRasterSelection: false,
    hasSelection: false,
    isEditingTextboxSelection: false,
    isEditingTextboxInput: false,
    key: 'z',
    metaKey: false,
    shiftKey: false,
    targetIsInteractive: false,
    ...overrides,
  };
}

function runEditorControllerKeyboardGuardSuite() {
  it('ignores shortcuts when the canvas is unavailable or focus is interactive', () => {
    expect(
      resolveEditorKeyboardAction(createKeyboardOptions({ ctrlKey: true, hasCanvas: false }))
    ).toBe('ignore');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'KeyD',
          ctrlKey: true,
          hasSelection: true,
          key: 'd',
          targetIsInteractive: true,
        })
      )
    ).toBe('ignore');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'Enter',
          isEditingTextboxInput: true,
          isEditingTextboxSelection: true,
          key: 'Enter',
          targetIsInteractive: true,
        })
      )
    ).toBe('exit-text-edit');
  });

  it('leaves native typing keys with Fabric while a textbox is editing', () => {
    const base = {
      isEditingTextboxInput: true,
      isEditingTextboxSelection: true,
      targetIsInteractive: true,
    };
    const cases = [
      { code: 'Space', key: ' ' },
      { code: 'Backspace', hasSelection: true, key: 'Backspace' },
      { code: 'Delete', hasSelection: true, key: 'Delete' },
      { code: 'KeyZ', ctrlKey: true, key: 'z' },
      { code: 'KeyD', ctrlKey: true, hasSelection: true, key: 'd' },
    ];

    cases.forEach((overrides) => {
      expect(resolveEditorKeyboardAction(createKeyboardOptions({ ...base, ...overrides }))).toBe(
        'ignore'
      );
    });
  });

  it('commits only plain Enter while textbox editing owns the keyboard', () => {
    const base = {
      code: 'Enter',
      isEditingTextboxSelection: true,
      isEditingTextboxInput: true,
      key: 'Enter',
      targetIsInteractive: true,
    };
    expect(resolveEditorKeyboardAction(createKeyboardOptions(base))).toBe('exit-text-edit');

    const ignored = [
      { shiftKey: true },
      { isComposing: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { hasDrawSession: true, shiftKey: true },
    ];
    ignored.forEach((overrides) => {
      expect(resolveEditorKeyboardAction(createKeyboardOptions({ ...base, ...overrides }))).toBe(
        'ignore'
      );
    });

    expect(
      resolveEditorKeyboardAction(createKeyboardOptions({ ...base, hasDrawSession: true }))
    ).toBe('exit-text-edit');
  });

  it('ignores stale textbox editing state when the event is not from its hidden textarea', () => {
    const base = {
      isEditingTextboxInput: false,
      isEditingTextboxSelection: true,
      targetIsInteractive: false,
    };
    const cases = [
      { code: 'Enter', key: 'Enter' },
      { code: 'Escape', key: 'Escape' },
      { code: 'KeyB', ctrlKey: true, key: 'b' },
    ];

    cases.forEach((overrides) => {
      expect(resolveEditorKeyboardAction(createKeyboardOptions({ ...base, ...overrides }))).toBe(
        'ignore'
      );
    });
  });
}

it('resolves space and history shortcuts', () => {
  expect(resolveEditorKeyboardAction(createKeyboardOptions({ code: 'Space', key: ' ' }))).toBe(
    'space-down'
  );
  expect(resolveEditorKeyboardAction(createKeyboardOptions({ ctrlKey: true }))).toBe('undo');
  expect(
    resolveEditorKeyboardAction(createKeyboardOptions({ ctrlKey: true, shiftKey: true }))
  ).toBe('redo');
  expect(
    resolveEditorKeyboardAction(createKeyboardOptions({ code: 'KeyY', ctrlKey: true, key: 'y' }))
  ).toBe('redo');
});

it('resolves and guards text style shortcuts', () => {
  const cases = [
    [
      {
        code: 'KeyB',
        ctrlKey: true,
        isEditingTextboxInput: true,
        isEditingTextboxSelection: true,
        key: 'b',
        targetIsInteractive: true,
      },
      'bold',
    ],
    [{ code: 'KeyI', hasSelectedTextTarget: true, key: 'i', metaKey: true }, 'italic'],
    [{ code: 'KeyS', ctrlKey: true, hasSelectedTextTarget: true, key: 's' }, 'linethrough'],
    [{ code: 'KeyU', ctrlKey: true, hasSelectedTextTarget: true, key: 'u' }, 'underline'],
  ] as const;

  cases.forEach(([overrides, command]) => {
    expect(resolveEditorKeyboardAction(createKeyboardOptions(overrides))).toEqual({
      command,
      type: 'text-style',
    });
  });
  expect(
    resolveEditorKeyboardAction(createKeyboardOptions({ code: 'KeyB', ctrlKey: true, key: 'b' }))
  ).toBe('ignore');
  expect(
    resolveEditorKeyboardAction(
      createKeyboardOptions({
        altKey: true,
        ctrlKey: true,
        isEditingTextboxInput: true,
        isEditingTextboxSelection: true,
      })
    )
  ).toBe('ignore');
  expect(
    resolveEditorKeyboardAction(
      createKeyboardOptions({
        code: 'KeyK',
        ctrlKey: true,
        hasSelectedTextTarget: true,
        key: 'k',
      })
    )
  ).toBe('ignore');
});

function registerSelectionShortcutTest() {
  it('resolves duplicate, escape, delete, and crop actions', () => {
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({ code: 'KeyD', ctrlKey: true, hasSelection: true, key: 'd' })
      )
    ).toBe('duplicate-selection');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'Escape',
          isEditingTextboxInput: true,
          isEditingTextboxSelection: true,
          key: 'Escape',
        })
      )
    ).toBe('cancel-text-edit');
    expect(
      resolveEditorKeyboardAction(createKeyboardOptions({ code: 'Escape', key: 'Escape' }))
    ).toBe('cancel-transient');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({ code: 'Delete', hasSelection: true, key: 'Delete' })
      )
    ).toBe('delete-selection');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({ code: 'Enter', hasDrawSession: true, key: 'Enter' })
      )
    ).toBe('complete-draw');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({ code: 'Enter', hasCropGuide: true, key: 'Enter' })
      )
    ).toBe('apply-crop');
  });
}

function registerArrowNudgeResolutionTest() {
  it('resolves arrow-key nudges', () => {
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'ArrowLeft',
          hasSelection: true,
          key: 'ArrowLeft',
        })
      )
    ).toEqual({
      code: 'ArrowLeft',
      deltaX: -1,
      deltaY: 0,
      step: 1,
    });
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'ArrowDown',
          hasSelection: true,
          key: 'ArrowDown',
          shiftKey: true,
        })
      )
    ).toEqual({
      code: 'ArrowDown',
      deltaX: 0,
      deltaY: 5,
      step: 5,
    });
  });
}

function registerArrowNudgeGuardTest() {
  it('blocks arrow-key nudges for unsupported modifier and editing cases', () => {
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'ArrowUp',
          ctrlKey: true,
          hasSelection: true,
          key: 'ArrowUp',
        })
      )
    ).toBe('ignore');
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'ArrowUp',
          hasSelection: true,
          isEditingTextboxSelection: true,
          key: 'ArrowUp',
        })
      )
    ).toBe('ignore');
  });
}

function registerEnterTextTargetTest() {
  it('enters text editing only when Enter targets a selected text owner', () => {
    expect(
      resolveEditorKeyboardAction(
        createKeyboardOptions({
          code: 'Enter',
          hasSelectedTextTarget: true,
          key: 'Enter',
        })
      )
    ).toBe('enter-text-edit');
    expect(
      resolveEditorKeyboardAction(createKeyboardOptions({ code: 'Enter', key: 'Enter' }))
    ).toBe('ignore');
  });
}

function runEditorControllerKeyboardSelectionSuite() {
  registerSelectionShortcutTest();
  registerArrowNudgeResolutionTest();
  registerArrowNudgeGuardTest();
  registerEnterTextTargetTest();
}

function runEditorControllerKeyboardUtilitySuite() {
  it('detects the editor space key by event code', () => {
    expect(isEditorSpaceKey('Space')).toBe(true);
    expect(isEditorSpaceKey('KeyS')).toBe(false);
  });
}

describe('editor-controller-keyboard guards', runEditorControllerKeyboardGuardSuite);
describe('editor-controller-keyboard selection', runEditorControllerKeyboardSelectionSuite);
describe('editor-controller-keyboard utility', runEditorControllerKeyboardUtilitySuite);
