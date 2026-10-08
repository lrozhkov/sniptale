// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { installDiagnosticLogObserver } from '@sniptale/platform/observability/logger';
import { embedVirtualIframe } from './iframe.helpers';
afterEach(() => document.body.replaceChildren());
it('preserves iframe content binding without logging DOM identifiers or application codes', () => {
  const messages: string[] = [];
  const dispose = installDiagnosticLogObserver((event) => messages.push(event.message));
  try {
    const originalIframe = document.createElement('iframe');
    originalIframe.id = 'private-patient-frame';
    originalIframe.setAttribute('data-application-code', 'private-patient-code');
    document.body.append(originalIframe);
    const frameDocument = document.implementation.createHTMLDocument();
    Object.defineProperty(originalIframe, 'contentDocument', { value: frameDocument });
    const child = document.createElement('div');
    const nested = document.createElement('span');
    nested.setAttribute('data-iframe-source', 'retained-source');
    child.append(document.createElement('span'), nested);
    frameDocument.body.append(child);
    originalIframe.className = 'private-patient-class';
    originalIframe.src = 'https://example.test/private-patient';
    originalIframe.setAttribute('data-origin', 'private-patient-origin');
    const virtualBody = document.createElement('div');
    virtualBody.append(originalIframe.cloneNode());
    embedVirtualIframe({ originalIframe, virtualBody, virtualToOriginalMap: new Map() });
    expect(virtualBody.firstElementChild?.getAttribute('data-application-code')).toBe(
      'private-patient-code'
    );
    expect(messages).toContain('Preserved iframe application code');
    expect(messages).toContain('Inspecting iframe elements');
    expect(messages).toContain('Annotated iframe elements');
    expect(virtualBody.querySelector('[data-iframe-source="retained-source"]')).not.toBeNull();
    embedVirtualIframe({
      originalIframe,
      virtualBody: document.createElement('div'),
      virtualToOriginalMap: new Map(),
    });
    expect(messages).toContain('Virtual iframe not found');
    originalIframe.contentDocument!.body.remove();
    embedVirtualIframe({ originalIframe, virtualBody, virtualToOriginalMap: new Map() });
    expect(messages).toContain('Skipping iframe without body');
    expect(messages.join('\n')).not.toContain('private-patient');
  } finally {
    dispose();
  }
});
