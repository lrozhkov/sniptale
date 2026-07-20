import { expect, it, vi } from 'vitest';
import { buildSidebarColorActions, isRecordableRecentColor } from './colors';

it('distinguishes recordable recent colors from transparent and malformed values', () => {
  expect(isRecordableRecentColor('#abcdef')).toBe(true);
  expect(isRecordableRecentColor(' #ABCDEF ')).toBe(true);
  expect(isRecordableRecentColor('transparent')).toBe(false);
  expect(isRecordableRecentColor('#abc')).toBe(false);
});

it('separates preview-only color updates from committed recent-color writes', async () => {
  const rememberRecentColor = vi.fn(async () => undefined);
  const setter = vi.fn();
  const withHistoryMutedCall = vi.fn();
  const withHistoryMuted = (callback: () => void): void => {
    withHistoryMutedCall();
    callback();
  };
  const actions = buildSidebarColorActions({
    rememberRecentColor,
    withHistoryMuted,
  });

  actions.previewColor(setter, '#123456');
  actions.updateColor(setter, '#654321');
  actions.updateColor(setter, 'transparent');

  expect(setter).toHaveBeenCalledWith('#123456');
  expect(setter).toHaveBeenCalledWith('#654321');
  expect(setter).toHaveBeenCalledWith('transparent');
  expect(withHistoryMutedCall).toHaveBeenCalledOnce();
  expect(rememberRecentColor).toHaveBeenCalledOnce();
  expect(rememberRecentColor).toHaveBeenCalledWith('#654321');
});
