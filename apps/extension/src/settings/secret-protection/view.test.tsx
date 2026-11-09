// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { SecretProtectionView } from './view';
import { createMockSecretProtectionState } from './test-support';
let root: Root | null = null;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
it('keeps AI unenrolled when only WebDAV uses the locked common phrase', () => {
  const state = createMockSecretProtectionState();
  state.status = {
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
    participants: { ai: false, webdav: true },
  };
  root = createRoot(container);
  act(() => root?.render(<SecretProtectionView state={state} />));
  const switches = container.querySelectorAll('[role="switch"]');
  expect(switches[0]?.getAttribute('aria-checked')).toBe('false');
  expect(switches[1]?.getAttribute('aria-checked')).toBe('true');
  act(() => switches[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(state.handleOpenEnableDialog).toHaveBeenCalledWith('ai');
  act(() => switches[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(state.handleOpenDisableDialog).toHaveBeenCalledWith('webdav');
});
it('names enrolled WebDAV credentials and AI keys in global reset consent', () => {
  const description = translate('settings.secretProtection.resetDescription', 'en');
  expect(description).toContain('WebDAV');
  expect(description).toContain('AI provider API keys');
  expect(description).toContain('remote files');
});
it.each([false, true])(
  'routes common lock/unlock, change and reset commands (unlocked=%s)',
  (unlocked) => {
    const state = createMockSecretProtectionState();
    state.status = {
      isEnabled: true,
      isUnlocked: unlocked,
      mode: 'passphrase',
      participants: { ai: true, webdav: true },
    };
    root = createRoot(container);
    act(() => root?.render(<SecretProtectionView state={state} />));
    const find = (key: 'lockAction' | 'unlockAction' | 'changeAction' | 'resetAction') =>
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === translate(`settings.secretProtection.${key}`)
      );
    act(() => {
      find(unlocked ? 'lockAction' : 'unlockAction')?.click();
      find('changeAction')?.click();
      find('resetAction')?.click();
    });
    expect(unlocked ? state.handleLockNow : state.handleOpenUnlockDialog).toHaveBeenCalledOnce();
    expect(state.handleOpenChangeDialog).toHaveBeenCalledOnce();
    expect(state.handleOpenResetDialog).toHaveBeenCalledOnce();
  }
);
it('omits shared lifecycle commands while disabled and blocks every switch while status is unknown or busy', () => {
  const state = createMockSecretProtectionState();
  let markup = renderToStaticMarkup(<SecretProtectionView state={state} />);
  expect(markup).not.toContain(translate('settings.secretProtection.resetAction'));
  state.status = null;
  state.isLoading = true;
  root = createRoot(container);
  act(() => root?.render(<SecretProtectionView state={state} />));
  expect(Array.from(container.querySelectorAll('button')).every((b) => b.disabled)).toBe(true);
  state.status = { isEnabled: true, isUnlocked: true, mode: 'passphrase' };
  state.isLoading = false;
  act(() => root?.render(<SecretProtectionView state={state} />));
  expect(
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]')).every(
      (b) => b.disabled
    )
  ).toBe(true);
  state.status = {
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
    participants: { ai: true, webdav: true },
  };
  state.isBusy = true;
  act(() => root?.render(<SecretProtectionView state={state} />));
  expect(Array.from(container.querySelectorAll('button')).every((b) => b.disabled)).toBe(true);
});
it('keeps the local-encryption and shared-phrase explanations attached to the current mode', () => {
  const state = createMockSecretProtectionState();
  let markup = renderToStaticMarkup(<SecretProtectionView state={state} />);
  expect(markup).toContain(translate('settings.secretProtection.transparentDescription'));
  expect(translate('settings.secretProtection.transparentDescription', 'en')).toContain('profile');
  expect(markup).not.toContain(translate('settings.secretProtection.passphraseDescription'));
  state.status = {
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
    participants: { ai: true, webdav: false },
  };
  markup = renderToStaticMarkup(<SecretProtectionView state={state} />);
  expect(markup).toContain(translate('settings.secretProtection.passphraseDescription'));
  expect(markup).toContain(translate('settings.secretProtection.passphraseMode'));
  expect(markup).toContain(translate('settings.secretProtection.sessionLocked'));
  expect(markup).not.toContain(translate('settings.secretProtection.transparentDescription'));
});
