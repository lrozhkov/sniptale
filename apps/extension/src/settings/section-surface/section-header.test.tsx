import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsSectionHeader } from './section-header';

describe('SettingsSectionHeader', () => {
  it('renders kicker-only headers without an empty title shell', () => {
    const markup = renderToStaticMarkup(
      <SettingsSectionHeader kicker="Интерфейс" description="Описание раздела" />
    );

    expect(markup).toContain('Интерфейс');
    expect(markup).toContain('Описание раздела');
    expect(markup).not.toContain('text-[28px]');
  });

  it('still renders the title when one is provided', () => {
    const markup = renderToStaticMarkup(
      <SettingsSectionHeader kicker="Интерфейс" title="Большой заголовок" />
    );

    expect(markup).toContain('Большой заголовок');
  });
});
