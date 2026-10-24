// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Crosshair, MessageSquare } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { createTranslator } from '../../../platform/i18n';
import { GuideInspectorGroup } from '../inspector';
import { useTourInspectorSections } from './settings-sections';

function Probe({
  presentation,
  single = false,
}: {
  presentation: 'all' | 'sections';
  single?: boolean;
}) {
  const sections = useTourInspectorSections(presentation, createTranslator('en'));
  const [draft, setDraft] = useState('Draft');
  return sections('probe', [
    {
      id: 'content',
      label: 'Text',
      icon: MessageSquare,
      categorized: true,
      content: (
        <GuideInspectorGroup
          id="existing-content"
          icon={Crosshair}
          title="Legacy title"
          collapsible={false}
        >
          <textarea
            aria-label="Draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </GuideInspectorGroup>
      ),
    },
    ...(!single
      ? [
          {
            id: 'other',
            label: 'Other',
            icon: Crosshair,
            categorized: true,
            content: (
              <GuideInspectorGroup id="other" icon={Crosshair} title="Other">
                <input aria-label="Other value" />
              </GuideInspectorGroup>
            ),
          },
        ]
      : []),
  ]);
}

it('uses the same section name and icon in All and Sections and hides a mounted draft', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe presentation="all" />));
    const group = host.querySelector('section[aria-label="Text"]');
    expect(group).not.toBeNull();
    const trigger = group!.querySelector<HTMLButtonElement>('.guide-inspector-disclosure')!;
    expect(trigger.querySelector('.lucide-message-square')).not.toBeNull();
    const draft = host.querySelector('textarea');
    await act(async () => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('textarea')).toBe(draft);
    expect(draft!.closest('[hidden]')).not.toBeNull();
    await act(async () => trigger.click());
    expect(draft!.value).toBe('Draft');
    await act(async () => root.render(<Probe presentation="sections" />));
    expect(
      host.querySelector('nav button[aria-label="Text"] .lucide-message-square')
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps a single group directly available without an empty category rail', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe presentation="sections" single />));
    expect(host.querySelector('nav')).toBeNull();
    expect(host.querySelector('textarea')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
