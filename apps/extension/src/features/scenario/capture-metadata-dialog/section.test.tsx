// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioMetadataSectionView } from './section';
import { CommandPressScope } from '@sniptale/ui/control-language/press';

describe('ScenarioMetadataSectionView', () => {
  it('renders the canonical section shell for metadata items', () => {
    const markup = renderToStaticMarkup(
      <ScenarioMetadataSectionView
        title="Page"
        items={[
          { label: 'URL', value: 'https://example.test' },
          { label: 'Viewport', value: '0, 0 • 1280 × 720' },
        ]}
      />
    );

    expect(markup).toContain('Page');
    expect(markup).toContain('URL');
    expect(markup).toContain('https://example.test');
    expect(markup).toContain('sniptale-color-border-soft');
    expect(markup).toContain('sniptale-color-text-primary');
  });
});

it('uses readable definitions only in the adopted context and retains complete metadata', () => {
  const data = {
    title: 'Page',
    items: [{ label: 'URL', value: 'https://example.test/path?value=complete' }],
  };
  const pending = renderToStaticMarkup(<ScenarioMetadataSectionView {...data} />);
  const adopted = renderToStaticMarkup(
    <CommandPressScope value={true}>
      <ScenarioMetadataSectionView {...data} />
    </CommandPressScope>
  );
  expect(pending).toContain('rounded-[18px]');
  expect(pending).not.toContain('<dl');
  expect(adopted).toContain('<dl');
  expect(adopted).toContain('<dt');
  expect(adopted).toContain('<dd');
  expect(adopted).toContain(data.items[0]!.value);
  expect(adopted).not.toContain('<input');
});
