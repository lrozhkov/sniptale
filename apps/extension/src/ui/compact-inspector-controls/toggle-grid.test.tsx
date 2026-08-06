import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToggleGrid } from './toggle-grid';

describe('ToggleGrid', () => {
  it('renders active options with the shared outlined accent treatment', () => {
    const markup = renderToStaticMarkup(
      <ToggleGrid
        ariaLabel="Text style"
        options={[
          { active: true, label: 'Bold', onToggle: () => undefined },
          { active: false, label: 'Italic', onToggle: () => undefined },
        ]}
      />
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('bg-transparent text-[color:var(--sniptale-color-accent)]');
    expect(markup).toContain('hover:text-[color:var(--sniptale-color-accent-emphasis)]');
    expect(markup).not.toContain('var(--sniptale-color-accent)_12%');
  });
});
