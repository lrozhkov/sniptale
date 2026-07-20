import { expect, it } from 'vitest';
import { z } from 'zod';

import {
  MessageContractError,
  createGuardParser,
  createZodParser,
  defineMessageContractRegistry,
  defineZodSchema,
  parseMessageWithRegistry,
  parseResponseWithRegistry,
  type MessageContractRegistry,
} from './utils';

type TestRequestMap = {
  ping: { type: 'ping'; value: number };
};

type TestResponseMap = {
  ping: { ok: true };
};

const registry: MessageContractRegistry<TestRequestMap, TestResponseMap> = {
  ping: {
    parseRequest: createGuardParser(
      'ping request',
      (input): input is TestRequestMap['ping'] =>
        typeof input === 'object' &&
        input !== null &&
        (input as { type?: unknown }).type === 'ping' &&
        typeof (input as { value?: unknown }).value === 'number'
    ),
    parseResponse: createZodParser(
      'ping response',
      z.object({
        ok: z.literal(true),
      })
    ),
  },
};

it('parses known request and response payloads through the registry', () => {
  expect(parseMessageWithRegistry({ type: 'ping', value: 7 }, registry)).toEqual({
    type: 'ping',
    value: 7,
  });
  expect(parseResponseWithRegistry('ping', { ok: true }, registry)).toEqual({ ok: true });
});

it('rejects malformed inputs and unsupported message types', () => {
  expect(() => parseMessageWithRegistry(null, registry)).toThrowError(
    new MessageContractError('Message payload must be an object')
  );
  expect(() => parseMessageWithRegistry({}, registry)).toThrowError(
    new MessageContractError('Message payload is missing a string "type" field')
  );
  expect(() => parseMessageWithRegistry({ type: 'pong', value: 1 }, registry)).toThrowError(
    new MessageContractError('Unsupported message type: pong')
  );
  expect(() => parseResponseWithRegistry('pong' as 'ping', { ok: true }, registry)).toThrowError(
    new MessageContractError('Unsupported message type: pong')
  );
});

it('reports guard and zod parser failures with contract errors', () => {
  const guardParser = createGuardParser(
    'guarded payload',
    (input): input is { valid: true } =>
      typeof input === 'object' && input !== null && (input as { valid?: unknown }).valid === true
  );
  const zodParser = createZodParser(
    'typed payload',
    z.object({
      id: z.string(),
    })
  );

  expect(() => guardParser({ valid: false })).toThrowError(
    new MessageContractError('Invalid guarded payload')
  );
  expect(() => zodParser({ id: 3 })).toThrowError(
    /Invalid typed payload: id: Invalid input: expected string, received number/
  );
});

it('returns the original zod schema after compile-time contract binding', () => {
  const schema = z.object({ id: z.string() });
  const defineTestSchema = defineZodSchema<{ id: string }>();

  expect(defineTestSchema(schema)).toBe(schema);
});

it('returns the original message registry after compile-time contract binding', () => {
  const defineTestRegistry = defineMessageContractRegistry<TestRequestMap, TestResponseMap>();

  expect(defineTestRegistry(registry)).toBe(registry);
});
