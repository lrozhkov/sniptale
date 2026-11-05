import { expect, it } from 'vitest';
import { createDefaultSimplifySettings } from '../../../../../features/simplify/settings';
import { readSimplifyPngDimensions } from '../../runtime-message/simplify.types';
import { isSimplifyCommand, isSimplifyCompletion, runtimeSimplifyContracts } from './simplify';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
it('admits bounded PNG sources and rejects dimensions before decode', () => {
  expect(readSimplifyPngDimensions(png)).toEqual({ width: 1, height: 1 });
  expect(isSimplifyCommand({ operation: 'prepare', dataUrl: png })).toBe(true);
  const bytes = atob(png.slice(22));
  const large =
    bytes.slice(0, 16) + String.fromCharCode(0, 0, 128, 0, 0, 0, 128, 0) + bytes.slice(24);
  expect(readSimplifyPngDimensions('data:image/png;base64,' + btoa(large))).toBeNull();
  expect(readSimplifyPngDimensions(png.replace('image/png', 'image/jpeg'))).toBeNull();
});
it(
  'rejects invalid settings, noninteger and oversized regions, missing capability and ' +
    'forged result dimensions',
  () => {
    const command = {
      operation: 'render',
      sessionId: 'session-1',
      settings: createDefaultSimplifySettings(),
      region: { x: 0, y: 0, width: 1, height: 1 },
    };
    expect(isSimplifyCommand(command)).toBe(true);
    expect(
      isSimplifyCommand({ ...command, settings: { ...command.settings, sensitivity: 91 } })
    ).toBe(false);
    expect(isSimplifyCommand({ ...command, region: { ...command.region, x: 0.5 } })).toBe(false);
    expect(
      isSimplifyCommand({ ...command, region: { x: 0, y: 0, width: 32768, height: 32768 } })
    ).toBe(false);
    expect(() =>
      runtimeSimplifyContracts[MessageType.OFFSCREEN_SIMPLIFY_COMMAND].parseRequest({
        ...command,
        type: MessageType.OFFSCREEN_SIMPLIFY_COMMAND,
      })
    ).toThrow();
    expect(
      isSimplifyCompletion({
        sessionId: 'session-1',
        width: 2,
        height: 1,
        version: 'v1',
        dataUrl: png,
      })
    ).toBe(false);
  }
);

it('admits finite manual-text angles and rejects nonnumeric and nonfinite rotation at both boundaries', () => {
  const command = {
    operation: 'render',
    sessionId: 'session-1',
    settings: { ...createDefaultSimplifySettings(), automatic: false, manualKind: 'text' },
    region: { x: 0, y: 0, width: 10, height: 20 },
  };
  for (const rotation of [0, 15, 90, -90, 360, 450, -450, 15.5]) {
    const region = { ...command.region, rotation };
    expect(isSimplifyCommand({ ...command, region })).toBe(true);
    expect(() =>
      runtimeSimplifyContracts[MessageType.SIMPLIFY_COMMAND].parseRequest({
        ...command,
        region,
        type: MessageType.SIMPLIFY_COMMAND,
      })
    ).not.toThrow();
    expect(() =>
      runtimeSimplifyContracts[MessageType.OFFSCREEN_SIMPLIFY_COMMAND].parseRequest({
        ...command,
        region,
        type: MessageType.OFFSCREEN_SIMPLIFY_COMMAND,
        capabilityToken: 'test',
      })
    ).not.toThrow();
  }
  for (const rotation of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '90',
    null,
  ]) {
    const region = { ...command.region, rotation };
    expect(isSimplifyCommand({ ...command, region })).toBe(false);
    expect(() =>
      runtimeSimplifyContracts[MessageType.OFFSCREEN_SIMPLIFY_COMMAND].parseRequest({
        ...command,
        region,
        type: MessageType.OFFSCREEN_SIMPLIFY_COMMAND,
        capabilityToken: 'test',
      })
    ).toThrow();
  }
});
