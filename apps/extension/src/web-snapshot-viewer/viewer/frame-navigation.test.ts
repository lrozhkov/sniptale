// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE } from '../../features/web-snapshot/public';
import { blockSnapshotFrameNavigation } from './frame-navigation';

function createFrameWithLink(href: string): { iframe: HTMLIFrameElement; link: HTMLAnchorElement } {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const link = iframe.contentDocument!.createElement('a');
  link.setAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE, href);
  link.textContent = 'Open';
  iframe.contentDocument!.body.appendChild(link);
  return { iframe, link };
}

it('keeps snapshot navigation inert when external links are disabled', () => {
  const { iframe, link } = createFrameWithLink('https://example.test/page');
  const onOpenExternalLink = vi.fn();
  blockSnapshotFrameNavigation(iframe, { externalLinksEnabled: false, onOpenExternalLink });

  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(click);

  expect(click.defaultPrevented).toBe(true);
  expect(onOpenExternalLink).not.toHaveBeenCalled();
});

it('opens only a validated projected HTTP(S) link after an explicit click', () => {
  const { iframe, link } = createFrameWithLink('https://example.test/page?view=full#part');
  const onOpenExternalLink = vi.fn();
  blockSnapshotFrameNavigation(iframe, { externalLinksEnabled: true, onOpenExternalLink });

  link.click();
  expect(onOpenExternalLink).toHaveBeenCalledWith('https://example.test/page?view=full#part');

  link.setAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE, 'javascript:alert(1)');
  link.click();
  expect(onOpenExternalLink).toHaveBeenCalledTimes(1);
});

it('continues to block form submission independently of the link setting', () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const form = iframe.contentDocument!.createElement('form');
  iframe.contentDocument!.body.appendChild(form);
  blockSnapshotFrameNavigation(iframe, {
    externalLinksEnabled: true,
    onOpenExternalLink: vi.fn(),
  });

  const submit = new Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  expect(submit.defaultPrevented).toBe(true);
});
