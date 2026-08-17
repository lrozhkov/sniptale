import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sanitizeSettingsTransferTracePayload } from './settings-transfer-payload';

it('removes settings package, preview, report details, and canary secrets from traces', () => {
  const canaries = [
    'canary-api-key',
    'canary-passphrase',
    'canary-encrypted-envelope',
    'canary-device-id',
    'canary-private-prompt',
  ];
  const sanitized = sanitizeSettingsTransferTracePayload(MessageType.SETTINGS_TRANSFER, {
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileText: canaries.join('|'),
    selectedNodeIds: ['ai.prompts.global'],
    inspection: { conflicts: [{ raw: canaries[0] }], package: { raw: canaries[1] } },
    report: { added: 1, warnings: canaries },
  });
  const text = JSON.stringify(sanitized);
  for (const canary of canaries) expect(text).not.toContain(canary);
  expect(sanitized).toEqual({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileTextLength: canaries.join('|').length,
    selectedNodeCount: 1,
    conflictCount: 1,
    added: 1,
  });
});

it('passes through other message families and summarizes primitive transfer payloads', () => {
  const payload = { secret: 'ordinary-message' };
  expect(sanitizeSettingsTransferTracePayload('OTHER_MESSAGE', payload)).toBe(payload);
  expect(sanitizeSettingsTransferTracePayload(MessageType.SETTINGS_TRANSFER, null)).toEqual({
    payloadPresent: false,
  });
  expect(sanitizeSettingsTransferTracePayload(MessageType.SETTINGS_TRANSFER, 'hidden')).toEqual({
    payloadPresent: true,
  });
});

it('keeps only bounded response metadata and numeric report counts', () => {
  expect(
    sanitizeSettingsTransferTracePayload(MessageType.SETTINGS_TRANSFER, {
      operation: 'commit-import',
      success: false,
      errorCode: 'quota-exceeded',
      selectedNodeIds: 'invalid',
      inspection: { conflicts: 'invalid' },
      report: {
        added: 1,
        updated: 2,
        copiedRemapped: 3,
        unchanged: 4,
        skipped: 5,
        warnings: ['private'],
      },
    })
  ).toEqual({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    success: false,
    errorCode: 'quota-exceeded',
    conflictCount: 0,
    added: 1,
    updated: 2,
    copiedRemapped: 3,
    unchanged: 4,
    skipped: 5,
  });
});
