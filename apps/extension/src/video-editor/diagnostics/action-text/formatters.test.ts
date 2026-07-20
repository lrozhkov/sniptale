import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import {
  classifyElement,
  formatChangeAction,
  formatClickAction,
  formatInputAction,
  formatKeydownAction,
  formatScrollAction,
  getElementText,
} from './formatters';

describe('human-readable action classification', () => {
  it.each([
    [{ role: 'button', tagName: 'div' }, 'button'],
    [{ role: 'link', tagName: 'div' }, 'link'],
    [{ role: 'tab', tagName: 'div' }, 'tab'],
    [{ role: 'menu', tagName: 'div' }, 'menu'],
    [{ role: 'menuitem', tagName: 'div' }, 'menuitem'],
    [{ role: 'checkbox', tagName: 'div' }, 'checkbox'],
    [{ role: 'radio', tagName: 'div' }, 'radio'],
    [{ tagName: 'a' }, 'link'],
    [{ tagName: 'select' }, 'select'],
    [{ tagName: 'input', type: 'checkbox' }, 'checkbox'],
    [{ tagName: 'input', type: 'radio' }, 'radio'],
    [{ tagName: 'input', type: 'text' }, 'input'],
    [{ tagName: 'textarea' }, 'input'],
    [{ tagName: 'div', className: 'gwt-button primary' }, 'button'],
    [{ tagName: 'div', className: 'btn secondary' }, 'button'],
    [{ tagName: 'div', className: 'gwt-tab active' }, 'tab'],
    [{ tagName: 'div', className: 'menuitem-row' }, 'menuitem'],
    [{ tagName: 'div', className: 'vectorIcon' }, 'icon'],
    [{ tagName: 'div', className: 'gwt-html inline-icon' }, 'icon'],
    [{ tagName: 'span' }, 'text'],
    [{ tagName: 'p' }, 'text'],
    [{ tagName: 'img' }, 'image'],
    [{ tagName: 'article' }, 'unknown'],
  ] satisfies Array<[Record<string, string>, string]>)('classifies %o as %s', (data, expected) => {
    expect(classifyElement(data)).toBe(expected);
  });
});

describe('human-readable action text extraction accessible sources', () => {
  it('prefers aria labels, titles, placeholders, and input values', () => {
    expect(
      getElementText(
        {
          ariaLabel: 'Primary label',
          text: 'Ignored text',
        },
        'button'
      )
    ).toBe('Primary label');

    expect(
      getElementText(
        {
          title: 'Tooltip title',
          text: 'Ignored text',
        },
        'button'
      )
    ).toBe('Tooltip title');

    expect(
      getElementText(
        {
          placeholder: 'Search here',
        },
        'input'
      )
    ).toBe('Search here');

    expect(
      getElementText(
        {
          value: 'Input value',
        },
        'input'
      )
    ).toBe('Input value');
  });
});

describe('human-readable action text extraction truncation', () => {
  it('truncates long text and falls back when non-input values have no label', () => {
    expect(
      getElementText(
        {
          text: 'x'.repeat(70),
        },
        'text'
      )
    ).toBe(`${'x'.repeat(49)}...`);

    expect(
      getElementText(
        {
          value: 'Ignored value',
        },
        'text'
      )
    ).toBe('videoEditor.diagnostics.noTextFallbackPrefix (element)');
  });
});

describe('human-readable action text extraction links', () => {
  it('uses pathname or raw href for links', () => {
    expect(
      getElementText(
        {
          href: 'https://example.com/reports/weekly',
        },
        'link'
      )
    ).toBe('/reports/weekly');

    expect(
      getElementText(
        {
          href: 'https://example.com',
        },
        'link'
      )
    ).toBe('/');

    expect(
      getElementText(
        {
          href: 'not a url value',
        },
        'link'
      )
    ).toBe('not a url value');
  });
});

describe('human-readable action text extraction fallback', () => {
  it('falls back to tag name and id when no text-like source exists', () => {
    expect(
      getElementText(
        {
          tagName: 'button',
          id: 'cta',
        },
        'button'
      )
    ).toBe('videoEditor.diagnostics.noTextFallbackPrefix (button#cta)');
  });
});

describe('human-readable action formatting clicks', () => {
  it('formats click actions with and without a recognized role', () => {
    expect(
      formatClickAction({
        tagName: 'button',
        text: 'Save',
      })
    ).toBe('videoEditor.diagnostics.clickPrefix "Save" (videoEditor.diagnostics.roleButton)');

    expect(
      formatClickAction({
        tagName: 'article',
      })
    ).toBe(
      'videoEditor.diagnostics.clickPrefix "videoEditor.diagnostics.noTextFallbackPrefix (article)"'
    );
  });

  it('omits the role suffix for explicit unknown roles', () => {
    expect(
      formatClickAction({
        role: 'unknown',
        tagName: 'article',
      })
    ).toBe(
      'videoEditor.diagnostics.clickPrefix "videoEditor.diagnostics.noTextFallbackPrefix (article)"'
    );
  });
});

describe('human-readable action formatting keys', () => {
  it('formats special keys, hotkeys, key presses, and generic keydown actions', () => {
    expect(formatKeydownAction({ key: 'Enter' })).toBe('videoEditor.diagnostics.keyEnter');
    expect(formatKeydownAction({ key: 'Escape' })).toBe('videoEditor.diagnostics.keyEscape');
    expect(formatKeydownAction({ key: 'Tab' })).toBe('videoEditor.diagnostics.keyTab');
    expect(formatKeydownAction({ key: 'Backspace' })).toBe('videoEditor.diagnostics.keyBackspace');
    expect(formatKeydownAction({ key: 'Delete' })).toBe('videoEditor.diagnostics.keyDelete');
    expect(formatKeydownAction({ key: 'ArrowUp' })).toBe('videoEditor.diagnostics.keyArrowUp');
    expect(formatKeydownAction({ key: 'ArrowDown' })).toBe('videoEditor.diagnostics.keyArrowDown');
    expect(formatKeydownAction({ key: 'ArrowLeft' })).toBe('videoEditor.diagnostics.keyArrowLeft');
    expect(formatKeydownAction({ key: 'ArrowRight' })).toBe(
      'videoEditor.diagnostics.keyArrowRight'
    );
    expect(formatKeydownAction({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(
      'videoEditor.diagnostics.hotkeyPrefix Ctrl+Shift+K'
    );
    expect(formatKeydownAction({ key: 'p', metaKey: true, altKey: true })).toBe(
      'videoEditor.diagnostics.hotkeyPrefix Ctrl+Alt+P'
    );
    expect(formatKeydownAction({ key: 'x' })).toBe('videoEditor.diagnostics.keyPressPrefix X');
    expect(formatKeydownAction({ key: 'Home' })).toBe(
      'videoEditor.diagnostics.keyGenericPrefix Home'
    );
  });
});

describe('human-readable action formatting interaction summaries', () => {
  it('formats scroll, input, and change actions', () => {
    expect(formatScrollAction({ direction: 'up' })).toBe('videoEditor.diagnostics.scrollUp');
    expect(formatScrollAction({ direction: 'down' })).toBe('videoEditor.diagnostics.scrollDown');

    expect(
      formatInputAction({
        tagName: 'input',
        value: 'Updated value',
      })
    ).toBe('videoEditor.diagnostics.textInputPrefix "Updated value"');

    expect(
      formatChangeAction({
        tagName: 'select',
        title: 'Status',
      })
    ).toBe('videoEditor.diagnostics.changePrefix "Status"');
  });
});
