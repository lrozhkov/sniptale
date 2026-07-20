import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GlassSelectMenu } from './menu';

describe('GlassSelectMenu', () => {
  it('renders one heading per contiguous option group before grouped template options', () => {
    const markup = renderToStaticMarkup(
      <GlassSelectMenu
        options={[
          { value: 'lower-third', label: 'Lower third', groupLabel: 'Lower thirds' },
          { value: 'callout', label: 'Callout', groupLabel: 'Annotations' },
          { value: 'pointer', label: 'Pointer', groupLabel: 'Annotations' },
          { value: 'title', label: 'Title', groupLabel: 'Titles' },
        ]}
        value="callout"
        size="md"
        portal={false}
        portalTheme={null}
        portalStyle={{}}
        menuPosition="bottom"
        menuSizeClasses="w-48"
        menuClassName=""
        menuSurfaceClassName="surface"
        menuRef={createRef<HTMLDivElement>()}
        isPopupFlat={false}
        onSelect={vi.fn()}
      />
    );

    expect(markup).toContain('Lower thirds');
    expect(markup).toContain('Annotations');
    expect(markup).toContain('Titles');
    expect(markup.match(/Annotations/g)).toHaveLength(1);
    expect(markup).toContain('aria-selected="true"');
  });
});
