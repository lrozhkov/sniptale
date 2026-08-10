// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsSectionHeader } from './section-header';
import {
  SettingsSectionHeaderActions,
  SettingsSectionHeaderActionsProvider,
} from './section-header-actions';

describe('SettingsSectionHeader', () => {
  it('renders one compact page title and its description', () => {
    const markup = renderToStaticMarkup(
      <SettingsSectionHeader kicker="Интерфейс" description="Описание раздела" />
    );

    expect(markup).toContain('Интерфейс');
    expect(markup).toContain('Описание раздела');
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).not.toContain('text-[28px]');
  });

  it('hosts section-owned actions in the shell header', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <SettingsSectionHeaderActionsProvider>
          <SettingsSectionHeader kicker="Хранилище" description="Описание" />
          <SettingsSectionHeaderActions>
            <button type="button">Сбросить</button>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeaderActionsProvider>
      )
    );

    expect(container.querySelector('header button')?.textContent).toBe('Сбросить');
    act(() => root.unmount());
  });
});
