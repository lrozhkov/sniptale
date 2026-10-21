// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../../composition/persistence/library-lifecycle';
import { translate } from '../../../../platform/i18n';
import { StorageDraftsContent } from './content';

const navigation = vi.hoisted(() => ({ openGalleryPage: vi.fn(), openSettingsPage: vi.fn() }));
vi.mock('../../../../platform/navigation/extension-pages', () => navigation);

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let props: ComponentProps<typeof StorageDraftsContent>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  props = {
    busy: false,
    onDeleteAllRequest: vi.fn(),
    onDeleteExpiredRequest: vi.fn(),
    policy: { ...DEFAULT_LOCAL_STORAGE_POLICY, cleanupEnabled: true, trashCleanupEnabled: true },
    policyLoaded: true,
    retryTrashPolicy: vi.fn(),
    trashPolicyFeedback: null,
    updatePolicy: vi.fn(async () => undefined),
    usage: null,
    view: 'drafts',
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render() {
  act(() => root.render(<StorageDraftsContent {...props} />));
}

function button(label: string) {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
  expect(found).toBeDefined();
  return found!;
}

async function select(label: string, optionLabel: string) {
  act(() => button(label).click());
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.textContent?.includes(optionLabel)
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
}

it('keeps deletion consequences without redundant explanations in the drafts form', () => {
  render();
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.destinationDescription')
  );
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.cleanupEnabledDescription')
  );
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.trashCleanupDescription')
  );
  expect(container.textContent).toContain(translate('settings.storageDrafts.retentionConsequence'));
  expect(container.textContent).toContain(
    translate('settings.storageDrafts.trashRetentionConsequence')
  );
});

it('routes destination, cleanup, and numeric retention selections to their policy fields', async () => {
  render();
  for (const [label, key] of [
    ['destinationLabel', 'defaultDestination'],
    ['recordingDestination', 'recordingDestination'],
    ['webSnapshotDestination', 'webSnapshotDestination'],
  ] as const) {
    const value = key === 'webSnapshotDestination' ? 'temporary' : 'library';
    await select(
      translate(`settings.storageDrafts.${label}`),
      translate(
        value === 'library'
          ? 'settings.storageDrafts.destinationLibrary'
          : 'settings.storageDrafts.destinationTemporary'
      )
    );
    expect(props.updatePolicy).toHaveBeenLastCalledWith({ [key]: value });
  }
  for (const [label, key] of [
    ['ordinaryRetention', 'draftRetentionDays'],
    ['videoRetention', 'videoDraftRetentionDays'],
    ['trashRetention', 'trashRetentionDays'],
  ] as const) {
    await select(
      translate(`settings.storageDrafts.${label}`),
      `7 ${translate('settings.storageDrafts.daySuffix')}`
    );
    expect(props.updatePolicy).toHaveBeenLastCalledWith({ [key]: 7 });
  }
  act(() => button(translate('settings.storageDrafts.cleanupEnabled')).click());
  expect(props.updatePolicy).toHaveBeenLastCalledWith({ cleanupEnabled: false });
  act(() => button(translate('settings.storageDrafts.trashCleanupEnabled')).click());
  expect(props.updatePolicy).toHaveBeenLastCalledWith({ trashCleanupEnabled: false });
});

it('shows retention and deletion consequences without the repeated Details explanation', () => {
  render();
  expect(container.querySelector('details')).toBeNull();
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.newItemsDescription')
  );
  for (const message of ['retentionConsequence', 'trashRetentionConsequence'] as const) {
    expect(container.textContent).toContain(translate(`settings.storageDrafts.${message}`));
  }
});

it('reports trash save progress and retries only when the failed policy is editable', () => {
  props.trashPolicyFeedback = 'error';
  props.busy = true;
  render();
  const retryLabel = translate('settings.storageDrafts.retry');
  expect(container.textContent).toContain(translate('settings.storageDrafts.trashSaveFailed'));
  expect(button(retryLabel).disabled).toBe(true);
  act(() => button(retryLabel).click());
  expect(props.retryTrashPolicy).not.toHaveBeenCalled();
  expect(
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        'button[aria-haspopup="listbox"], button[role="switch"]'
      )
    ).every((node) => node.disabled)
  ).toBe(true);
  props.busy = false;
  render();
  act(() => button(retryLabel).click());
  expect(props.retryTrashPolicy).toHaveBeenCalledOnce();
  for (const [feedback, label] of [
    ['saving', 'trashSaving'],
    ['saved', 'trashSaved'],
  ] as const) {
    props.trashPolicyFeedback = feedback;
    render();
    expect(container.textContent).not.toContain(translate(`settings.storageDrafts.${label}`));
    expect(container.textContent).not.toContain(retryLabel);
  }
});

it('keeps management in Library and preserves cleanup warnings and privacy navigation', () => {
  props.policy.cleanupEnabled = false;
  props.policy.trashCleanupEnabled = false;
  render();
  const all = translate('settings.storageDrafts.deleteAll');
  expect(container.textContent).not.toContain(all);
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.draftActionsTitle')
  );
  expect(button(translate('settings.storageDrafts.ordinaryRetention')).disabled).toBe(true);
  expect(button(translate('settings.storageDrafts.trashRetention')).disabled).toBe(true);
  expect(container.textContent).not.toContain(
    translate('settings.storageDrafts.trashCleanupDisabled')
  );
  expect(container.textContent).toContain(
    translate('settings.storageDrafts.cleanupDisabledWarning')
  );
  expect(props.onDeleteAllRequest).not.toHaveBeenCalled();
  expect(props.onDeleteExpiredRequest).not.toHaveBeenCalled();
  props.view = 'storage';
  render();
  expect(container.textContent).toContain(translate('settings.storageDrafts.loading'));
  expect(container.textContent).not.toContain(all);
  act(() => button(translate('settings.storageDrafts.privacyLink')).click());
  expect(navigation.openSettingsPage).toHaveBeenCalledWith({
    route: { section: 'access-data', view: 'privacy' },
  });
  props.usage = { available: 70, drafts: 10, library: 20, total: 30 };
  render();
  expect(container.querySelectorAll('dl dd')).toHaveLength(4);
  expect(container.textContent).not.toContain(translate('settings.storageDrafts.loading'));
});
