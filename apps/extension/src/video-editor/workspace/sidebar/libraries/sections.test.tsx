import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { ActionButton } from './sections';

describe('workspace-sidebar/libraries/sections', () => {
  it('renders library actions with the borderless matte CTA treatment', () => {
    const markup = renderToStaticMarkup(
      <ActionButton
        title="videoEditor.sidebar.importImage"
        icon={<span>+</span>}
        onClick={() => undefined}
      />
    );

    expect(markup).toContain('border-none');
    expect(markup).toContain('text-[12px] font-medium');
    expect(markup).toContain('videoEditor.sidebar.importImage');
  });

  it('supports full-width rows for import toolbar actions', () => {
    const markup = renderToStaticMarkup(
      <ActionButton
        title="videoEditor.sidebar.toolbarNew"
        icon={<span>+</span>}
        onClick={() => undefined}
        fullWidth
      />
    );

    expect(markup).toContain('w-full justify-start');
  });
});
