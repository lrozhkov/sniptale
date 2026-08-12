// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AnnotationNewSessionDefaults } from './new-session-defaults';

const copy = {
  enabledDescription: 'Enabled description',
  enabledLabel: 'Enable by default',
  frameTemplate: 'From frame settings',
  primaryTemplate: 'Default template',
  sourceDescription: 'Source description',
  sourceLabel: 'Appearance',
  sectionDescription: 'Applies next session',
  sectionTitle: 'For new sessions',
};

it('exposes current defaults and routes both controls through explicit actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onEnabledChange = vi.fn();
  const onTemplateSourceChange = vi.fn();
  await act(async () =>
    root.render(
      <AnnotationNewSessionDefaults
        copy={copy}
        defaults={{ enabled: false, templateSource: 'frame-default' }}
        disabled={false}
        onEnabledChange={onEnabledChange}
        onTemplateSourceChange={onTemplateSourceChange}
      />
    )
  );

  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')?.click());
  expect(onEnabledChange).toHaveBeenCalledWith(true);

  act(() => host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')?.click());
  const forced = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent === copy.primaryTemplate
  );
  act(() => forced?.click());
  expect(onTemplateSourceChange).toHaveBeenCalledWith('forced');

  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
