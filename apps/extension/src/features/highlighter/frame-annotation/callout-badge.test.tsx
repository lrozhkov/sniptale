// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import { FrameCalloutBadge } from './callout-badge';

it('uses the configured badge text when no resolved override is supplied', () => {
  const badge = {
    ...createSystemCalloutPresetCatalog()[0]!.style.badge,
    enabled: true,
    text: 'Configured tag',
  };

  expect(renderToStaticMarkup(<FrameCalloutBadge badge={badge} />)).toContain('Configured tag');
  expect(renderToStaticMarkup(<FrameCalloutBadge badge={{ ...badge, enabled: false }} />)).toBe('');
});

it('sizes an editable badge from its content without the native input character gutter', () => {
  const badge = {
    ...createSystemCalloutPresetCatalog()[0]!.style.badge,
    enabled: true,
    text: 'Tag',
  };

  const markup = renderToStaticMarkup(
    <FrameCalloutBadge badge={badge} isEditing onTextChange={() => undefined} />
  );

  expect(markup).toContain('field-sizing:content');
  expect(markup).not.toMatch(/\ssize="/);
});

it('keeps the compact editable badge interactive without widening it', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const onEditingFinish = vi.fn();
  const onTextChange = vi.fn();
  const badge = {
    ...createSystemCalloutPresetCatalog()[0]!.style.badge,
    enabled: true,
    text: 'Tag',
  };

  act(() => {
    root.render(
      <div className="sniptale-callout">
        <FrameCalloutBadge
          badge={badge}
          isEditing
          onEditingFinish={onEditingFinish}
          onTextChange={onTextChange}
        />
        <button data-inside="true" />
      </div>
    );
  });
  const input = host.querySelector<HTMLInputElement>('input')!;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(input, 'Edited');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.click();
  });
  expect(onTextChange).toHaveBeenCalledWith('Edited');
  expect(input.selectionEnd).toBe(input.value.length);

  act(() => {
    input.focus();
    host.querySelector<HTMLButtonElement>('[data-inside="true"]')!.focus();
  });
  expect(onEditingFinish).not.toHaveBeenCalled();

  const outside = document.body.appendChild(document.createElement('button'));
  act(() => {
    input.focus();
    outside.focus();
  });
  expect(onEditingFinish).toHaveBeenCalledOnce();

  for (const key of ['a', 'Enter', 'Escape']) {
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    });
  }
  expect(onEditingFinish).toHaveBeenCalledTimes(5);

  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
