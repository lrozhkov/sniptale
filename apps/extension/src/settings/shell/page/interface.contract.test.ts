import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const settings = readFileSync(new URL('./interface.css', import.meta.url), 'utf8');
const inspector = readFileSync(
  new URL('../../../ui/compact-inspector-controls/inspector-surface.css', import.meta.url),
  'utf8'
);

it('keeps Settings selection feedback separate from command pressure', () => {
  expect(settings).toContain("[data-ui='settings.subpage-tabs'] button");
  expect(settings).toContain("button[data-command-tone='toggle']");
  const start = settings.indexOf('> .sniptale-command-content');
  const rule = settings.slice(start, settings.indexOf('}', start));
  expect(rule).toContain('transform: none !important;');
  expect(rule).toContain('opacity: 1 !important;');
});

it('reuses the accepted circular checkbox drawing in Settings', () => {
  expect(inspector).toContain('.sniptale-recording-start-confirmation');
  const owners =
    '.sniptale-auto-blur-modal, .sniptale-settings-workspace, .sniptale-recording-start-confirmation';
  expect(inspector.replace(/\s+/g, ' ')).toContain(
    `:is(${owners}) .sniptale-parameter-check::after`
  );
});

it('keeps Settings modal controls fixed while the compact body scrolls', () => {
  expect(settings).toContain('.sniptale-modal.sniptale-settings-workspace .sniptale-modal-body-sm');
  const start = settings.indexOf(
    '.sniptale-modal.sniptale-settings-workspace .sniptale-modal-body-sm'
  );
  const rule = settings.slice(start, settings.indexOf('}', start));
  expect(rule).toContain('min-height: 0;');
  expect(rule).toContain('flex: 1 1 auto;');
  expect(settings).toContain('.sniptale-modal-body-sm:not(.overflow-hidden)');
  expect(settings).toContain('overflow-y: auto;');
  expect(settings).toContain('flex-shrink: 0;');
});
