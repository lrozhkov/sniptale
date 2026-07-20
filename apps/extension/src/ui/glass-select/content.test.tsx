/* eslint-disable max-lines-per-function --
   exact content proof keeps the controller/overlay branches in one owner-local suite */
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { GlassSelectContent } from './content';

describe('GlassSelectContent', () => {
  it('renders the trigger placeholder and a closed overlay without a selected option', () => {
    const markup = renderToStaticMarkup(
      <GlassSelectContent
        controller={{
          containerRef: createRef<HTMLDivElement>(),
          handleSelect: vi.fn(),
          handleToggle: vi.fn(),
          isOpen: false,
          isPopupFlat: false,
          menuPosition: 'bottom',
          menuRef: createRef<HTMLDivElement>(),
          menuSizeClasses: 'w-48',
          menuSurfaceClassName: 'surface',
          placeholder: 'Choose model',
          portalStyle: {},
          portalTheme: null,
          selectedOption: undefined,
          triggerClassName: 'trigger',
        }}
        disabled={false}
        portal={false}
        options={[]}
        value=""
        size="md"
        menuClassName=""
      />
    );

    expect(markup).toContain('Choose model');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('renders selected option content and an open overlay', () => {
    const markup = renderToStaticMarkup(
      <GlassSelectContent
        controller={{
          containerRef: createRef<HTMLDivElement>(),
          handleSelect: vi.fn(),
          handleToggle: vi.fn(),
          isOpen: true,
          isPopupFlat: true,
          menuPosition: 'top',
          menuRef: createRef<HTMLDivElement>(),
          menuSizeClasses: 'w-48',
          menuSurfaceClassName: 'surface',
          placeholder: 'Choose model',
          portalStyle: {},
          portalTheme: null,
          selectedOption: { value: 'model-a', label: 'Model A', icon: <span>icon</span> },
          triggerClassName: 'trigger',
        }}
        disabled
        portal={false}
        options={[{ value: 'model-a', label: 'Model A' }]}
        value="model-a"
        size="sm"
        menuClassName="menu"
      />
    );

    expect(markup).toContain('Model A');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="listbox"');
  });
});
