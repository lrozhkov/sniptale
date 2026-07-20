// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { detectPayloadFramework } from './payload-framework.detector';

function resetDetectorDom() {
  document.body.replaceChildren();
}

afterEach(() => {
  resetDetectorDom();
});

describe('detectPayloadFramework', () => {
  it('returns null when no payload-framework markers are present', () => {
    document.body.append(document.createElement('main'));

    expect(detectPayloadFramework(document)).toBeNull();
  });

  it('detects Next.js payload roots and reports payload signals', () => {
    const nextData = document.createElement('script');
    nextData.id = '__NEXT_DATA__';
    document.body.append(nextData);

    const result = detectPayloadFramework(document);

    expect(result?.profile.appFamily).toBe('nextjs');
    expect(result?.matchedSignals).toEqual([
      expect.objectContaining({ id: 'payload.next-data', source: 'payload' }),
    ]);
  });

  it('lets later framework markers override appFamily while keeping all matched signals', () => {
    const nextData = document.createElement('script');
    nextData.id = '__NEXT_DATA__';
    const nuxtData = document.createElement('script');
    nuxtData.id = '__NUXT_DATA__';
    const angularRoot = document.createElement('div');
    angularRoot.setAttribute('ng-version', '17.0.0');
    const svelteKitRoot = document.createElement('div');
    svelteKitRoot.setAttribute('data-sveltekit-hydrate', 'true');

    document.body.append(nextData, nuxtData, angularRoot, svelteKitRoot);

    const result = detectPayloadFramework(document);

    expect(result?.profile.vendor).toBe('generic');
    expect(result?.profile.appFamily).toBe('sveltekit');
    expect(result?.profile.pipelineId).toBe('generic-safe-fallback');
    expect(result?.matchedSignals.map((signal) => signal.id)).toEqual([
      'payload.next-data',
      'payload.nuxt-data',
      'dom.angular-root',
      'dom.sveltekit-root',
    ]);
  });
});
