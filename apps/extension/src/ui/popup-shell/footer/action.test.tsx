import { renderToStaticMarkup } from 'react-dom/server';
import { Blocks } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { PopupFooterAction } from './action';

describe('PopupFooterAction', () => {
  it('renders footer actions through the borderless matte utility contract', () => {
    const markup = renderToStaticMarkup(
      <PopupFooterAction onClick={() => undefined} icon={Blocks} label="Design system" />
    );

    expect(markup).toContain('border-none');
    expect(markup).toContain('bg-transparent');
    expect(markup).toContain('text-[var(--sniptale-color-text-secondary)]');
  });
});
