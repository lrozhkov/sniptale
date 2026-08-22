import { expect, it } from 'vitest';
import { deriveChromeExtensionId } from './extension-browser-launch';

it('derives the deterministic Chrome extension ID from a manifest public key', () => {
  expect(deriveChromeExtensionId('AQ==')).toBe('elpfbccpdeeffemfdlnocollimnclhod');
});

it('rejects malformed manifest public keys before deriving an extension ID', () => {
  expect(() => deriveChromeExtensionId('not base64')).toThrow(/valid base64/u);
  expect(() => deriveChromeExtensionId('A')).toThrow(/valid base64/u);
});
