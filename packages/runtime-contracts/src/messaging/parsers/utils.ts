import type { z } from 'zod';

export class MessageContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageContractError';
  }
}

type MessageParser<TValue> = (input: unknown) => TValue;

type MessageContract<TRequest, TResponse> = {
  parseRequest: MessageParser<TRequest>;
  parseResponse: MessageParser<TResponse>;
};

export type MessageContractRegistry<
  TRequestMap extends Record<string, unknown>,
  TResponseMap extends Record<keyof TRequestMap, unknown>,
> = {
  [TType in Extract<keyof TRequestMap, string>]: MessageContract<
    TRequestMap[TType],
    TResponseMap[TType]
  >;
};

export function createGuardParser<TValue>(
  label: string,
  guard: (input: unknown) => input is TValue
): MessageParser<TValue> {
  return (input) => {
    if (!guard(input)) {
      throw new MessageContractError(`Invalid ${label}`);
    }

    return input;
  };
}

export function createZodParser<TValue>(
  label: string,
  schema: z.ZodType<TValue>
): MessageParser<TValue> {
  return (input) => {
    const result = schema.safeParse(input);

    if (!result.success) {
      const issueSummary = result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new MessageContractError(`Invalid ${label}: ${issueSummary}`);
    }

    return result.data;
  };
}

export function defineZodSchema<TValue>() {
  return <TSchema extends z.ZodType<TValue>>(schema: TSchema): TSchema => schema;
}

export function defineMessageContractRegistry<
  TRequestMap extends Record<string, unknown>,
  TResponseMap extends Record<keyof TRequestMap, unknown>,
>() {
  return (
    registry: MessageContractRegistry<TRequestMap, TResponseMap>
  ): MessageContractRegistry<TRequestMap, TResponseMap> => registry;
}

function getMessageType(input: unknown): string {
  if (typeof input !== 'object' || input === null) {
    throw new MessageContractError('Message payload must be an object');
  }

  const candidate = input as { type?: unknown };
  if (typeof candidate.type !== 'string') {
    throw new MessageContractError('Message payload is missing a string "type" field');
  }

  return candidate.type;
}

/**
 * Parses an unknown message against the canonical registry and returns the typed request.
 */
export function parseMessageWithRegistry<
  TRequestMap extends Record<string, unknown>,
  TResponseMap extends Record<keyof TRequestMap, unknown>,
>(
  input: unknown,
  registry: MessageContractRegistry<TRequestMap, TResponseMap>
): TRequestMap[Extract<keyof TRequestMap, string>] {
  const type = getMessageType(input);
  const contract = registry[type as Extract<keyof TRequestMap, string>];

  if (!contract) {
    throw new MessageContractError(`Unsupported message type: ${type}`);
  }

  return contract.parseRequest(input);
}

/**
 * Parses a raw transport response using the canonical response parser for the request type.
 */
export function parseResponseWithRegistry<
  TRequestMap extends Record<string, unknown>,
  TResponseMap extends Record<keyof TRequestMap, unknown>,
  TType extends Extract<keyof TRequestMap, string>,
>(
  type: TType,
  response: unknown,
  registry: MessageContractRegistry<TRequestMap, TResponseMap>
): TResponseMap[TType] {
  const contract = registry[type];

  if (!contract) {
    throw new MessageContractError(`Unsupported message type: ${type}`);
  }

  return contract.parseResponse(response);
}
