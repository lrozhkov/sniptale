// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { buildPortalHomepageFixture } from './homepage.test.fixtures';

describe('portal-homepage test fixtures', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.title = '';
    window.history.replaceState({}, '', '/');
  });

  it('builds the canonical portal homepage DOM scaffold', () => {
    buildPortalHomepageFixture();

    expect(document.title).toBe('Эталонный стенд для воспроизведения кейсов');
    expect(window.location.pathname).toBe('/portal/');
    expect(document.querySelector('.Main__root .SearchBlock__root')).not.toBeNull();
    expect(document.querySelectorAll('.Section__root')).toHaveLength(2);
    expect(document.querySelectorAll('.Footer__footerBlock a')).toHaveLength(2);
  });

  it('reuses helper defaults when appendElement-style builders receive no props', () => {
    buildPortalHomepageFixture();

    const titleLink = document.querySelector('.Title__title__href');
    const serviceCard = document.querySelector('.ServiceCall__serviceCall');
    const footer = document.querySelector('.Footer__footer');

    expect(titleLink).not.toBeNull();
    expect(serviceCard).not.toBeNull();
    expect(footer).not.toBeNull();
  });
});
