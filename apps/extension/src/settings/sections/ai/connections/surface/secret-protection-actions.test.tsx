// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { translate } from '../../../../../platform/i18n';
import { SecretProtectionActions } from './secret-protection-actions';
import { createMockSecretProtectionState } from './test-support';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(state: ReturnType<typeof createMockSecretProtectionState>) {
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <SecretProtectionActions state={state} />
      </CommandPressScope>
    )
  );
}

it('omits protection commands while passphrase protection is disabled', async () => {
  await render(createMockSecretProtectionState());
  expect(host.querySelectorAll('button')).toHaveLength(0);
});

it.each([false, true])(
  'routes protection commands to their owners when unlocked=%s',
  async (isUnlocked) => {
    const state = createMockSecretProtectionState();
    state.status = { isEnabled: true, isUnlocked, mode: 'passphrase' };
    await render(state);
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(4);
    const firstLabel = translate(
      isUnlocked
        ? 'settings.aiProviders.secretProtectionLockAction'
        : 'settings.aiProviders.secretProtectionUnlockAction'
    );
    expect(buttons[0]!.textContent).toBe(firstLabel);
    await act(async () => buttons.forEach((button) => button.click()));
    expect(isUnlocked ? state.handleLockNow : state.handleOpenUnlockDialog).toHaveBeenCalledOnce();
    expect(isUnlocked ? state.handleOpenUnlockDialog : state.handleLockNow).not.toHaveBeenCalled();
    expect(state.handleOpenChangeDialog).toHaveBeenCalledOnce();
    expect(state.handleOpenDisableDialog).toHaveBeenCalledOnce();
    expect(state.handleOpenResetDialog).toHaveBeenCalledOnce();
  }
);

it('blocks duplicate protection actions while the existing owner is busy', async () => {
  const state = createMockSecretProtectionState();
  state.status = { isEnabled: true, isUnlocked: false, mode: 'passphrase' };
  state.isBusy = true;
  await render(state);
  const buttons = [...host.querySelectorAll('button')];
  expect(buttons.every((button) => button.disabled)).toBe(true);
  await act(async () => buttons.forEach((button) => button.click()));
  expect(state.handleOpenUnlockDialog).not.toHaveBeenCalled();
  expect(state.handleOpenChangeDialog).not.toHaveBeenCalled();
  expect(state.handleOpenDisableDialog).not.toHaveBeenCalled();
  expect(state.handleOpenResetDialog).not.toHaveBeenCalled();
});
