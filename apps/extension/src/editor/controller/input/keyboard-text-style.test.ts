import { expect, it } from 'vitest';
import { resolveTextStyleKeyboardAction } from './keyboard-text-style';

it('maps supported text formatting shortcuts for active text owners', () => {
  expect(
    resolveTextStyleKeyboardAction({
      altKey: false,
      code: '',
      ctrlKey: true,
      hasSelectedTextTarget: false,
      isEditingTextboxSelection: true,
      key: 'b',
      metaKey: false,
    })
  ).toEqual({ command: 'bold', type: 'text-style' });
  expect(
    resolveTextStyleKeyboardAction({
      altKey: false,
      code: '',
      ctrlKey: false,
      hasSelectedTextTarget: true,
      isEditingTextboxSelection: false,
      key: 'u',
      metaKey: true,
    })
  ).toEqual({ command: 'underline', type: 'text-style' });
  expect(
    resolveTextStyleKeyboardAction({
      altKey: false,
      code: 'KeyB',
      ctrlKey: true,
      hasSelectedTextTarget: true,
      isEditingTextboxSelection: false,
      key: 'и',
      metaKey: false,
    })
  ).toEqual({ command: 'bold', type: 'text-style' });
});

it('ignores unsupported formatting shortcuts and alt-modified shortcuts', () => {
  expect(
    resolveTextStyleKeyboardAction({
      altKey: true,
      code: '',
      ctrlKey: true,
      hasSelectedTextTarget: true,
      isEditingTextboxSelection: false,
      key: 'b',
      metaKey: false,
    })
  ).toBeNull();
});
