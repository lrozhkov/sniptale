import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const controllerState = {
  containerRef: { current: null },
  handleSelect: vi.fn(),
  handleToggle: vi.fn(),
  isOpen: false,
  isPopupFlat: false,
  menuPosition: 'bottom' as const,
  menuRef: { current: null },
  menuSizeClasses: 'w-48',
  menuSurfaceClassName: 'surface',
  placeholder: 'Choose one',
  portalStyle: {},
  portalTheme: null,
  selectedOption: undefined,
  triggerClassName: 'trigger',
};

const glassSelectContentMock = vi.hoisted(() =>
  vi.fn(() => <div data-ui="glass-select.content" />)
);

vi.mock('./controller', async (importOriginal) => ({
  ...(await importOriginal()),
  useGlassSelectController: vi.fn(() => controllerState),
}));

vi.mock('./content', () => ({
  GlassSelectContent: glassSelectContentMock,
}));

import { GlassSelect } from './index';

describe('GlassSelect root', () => {
  it('forwards props to the controller-backed content owner', () => {
    const markup = renderToStaticMarkup(
      <GlassSelect
        value=""
        onChange={() => undefined}
        options={[{ value: 'one', label: 'One' }]}
        placeholder="Pick one"
        dataUi="shared.ui.glass"
        variant="popup-flat"
        portal
        size="sm"
        className="shell"
        menuClassName="menu"
        aria-label="Glass select"
      />
    );

    expect(markup).toContain('data-ui="shared.ui.glass"');
    expect(markup).toContain('aria-label="Glass select"');
    expect(markup).toContain('glass-select.content');
    expect(glassSelectContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disabled: false,
        menuClassName: 'menu',
        options: [{ value: 'one', label: 'One' }],
        portal: true,
        size: 'sm',
        value: '',
      }),
      undefined
    );
  });
});
