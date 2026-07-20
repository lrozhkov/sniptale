import {
  AiEgressAuthorityError,
  createContentAiEgressAuthority,
  createScenarioEditorEgressAuthority,
} from '../../../../features/ai/egress-authority';
import {
  assertProcessWithLlmPayloadLimits,
  assertScenarioEditorLlmPayloadLimits,
} from '../../../../contracts/ai/payload-limits';
import {
  processScenarioEditorWithLlmMessageSchema,
  processWithLlmMessageSchema,
  requestLlmSessionMessageSchema,
} from '../../../../contracts/messaging/contracts/llm-schemas';
import { consumeLlmSessionToken, resolveLlmSessionSenderKey } from '../session-tokens';
import {
  markPreauthorizedLlmRouteMessage,
  markPreauthorizedLlmSessionRequestMessage,
  markPreauthorizedScenarioEditorLlmRouteMessage,
} from './preauthorization';
import {
  AUTHORIZED,
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';

type BackgroundOwnedAuthorizationRequest = {
  readonly message: { readonly type: string } & Record<string, unknown>;
  readonly sender: chrome.runtime.MessageSender;
};

function hasObjectField(
  message: Record<string, unknown>,
  field: string
): message is Record<string, unknown> & { [key: string]: object } {
  const value = message[field];
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function authorizeLlmSessionRequestRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  const parsedMessage = requestLlmSessionMessageSchema.safeParse(request.message);
  if (!parsedMessage.success) {
    return reject('Invalid LLM session request');
  }

  const { purpose, egressAuthority } = parsedMessage.data;
  if (
    (purpose !== 'content-ai-pick' && purpose !== 'scenario-editor') ||
    egressAuthority.purpose !== purpose ||
    !resolveLlmSessionSenderKey(purpose, request.sender)
  ) {
    return reject('Unauthorized LLM session sender');
  }
  markPreauthorizedLlmSessionRequestMessage(request.message);
  return AUTHORIZED;
}

export async function authorizeContentLlmRoute(
  request: BackgroundOwnedAuthorizationRequest
): Promise<IpcAuthorizationResult> {
  if (!hasObjectField(request.message, 'privacyProof')) {
    return reject('Missing AI privacy proof');
  }
  const parsedMessage = processWithLlmMessageSchema.safeParse(request.message);
  if (!parsedMessage.success) {
    return reject('Invalid LLM request');
  }
  const payloadLimitAuthorization = authorizeLlmPayloadLimits(() =>
    assertProcessWithLlmPayloadLimits(parsedMessage.data)
  );
  if (!payloadLimitAuthorization.authorized) {
    return payloadLimitAuthorization;
  }

  const egressAuthority = await createLlmRouteEgressAuthority(() =>
    createContentAiEgressAuthority({
      payload: {
        jsonData: parsedMessage.data.jsonData,
        markdownData: parsedMessage.data.markdownData,
      },
      privacyProof: parsedMessage.data.privacyProof,
    })
  );
  if (!egressAuthority.authorized) {
    return egressAuthority;
  }

  if (
    !consumeLlmSessionToken({
      egressAuthority: egressAuthority.value,
      purpose: 'content-ai-pick',
      sender: request.sender,
      token: parsedMessage.data.llmSessionToken,
    })
  ) {
    return reject('Unauthorized LLM request');
  }
  markPreauthorizedLlmRouteMessage(request.message);
  return AUTHORIZED;
}

export async function authorizeScenarioEditorLlmRoute(
  request: BackgroundOwnedAuthorizationRequest
): Promise<IpcAuthorizationResult> {
  const parsedMessage = processScenarioEditorWithLlmMessageSchema.safeParse(request.message);
  if (!parsedMessage.success) {
    return reject('Invalid LLM request');
  }
  const payloadLimitAuthorization = authorizeLlmPayloadLimits(() =>
    assertScenarioEditorLlmPayloadLimits(parsedMessage.data)
  );
  if (!payloadLimitAuthorization.authorized) {
    return payloadLimitAuthorization;
  }

  const egressAuthority = await createLlmRouteEgressAuthority(() =>
    createScenarioEditorEgressAuthority(parsedMessage.data)
  );
  if (!egressAuthority.authorized) {
    return egressAuthority;
  }

  if (
    !consumeLlmSessionToken({
      egressAuthority: egressAuthority.value,
      purpose: 'scenario-editor',
      sender: request.sender,
      token: parsedMessage.data.llmSessionToken,
    })
  ) {
    return reject('Unauthorized LLM request');
  }
  markPreauthorizedScenarioEditorLlmRouteMessage(request.message);
  return AUTHORIZED;
}

type LlmRouteEgressAuthorityResult<TValue> =
  | { authorized: true; value: TValue }
  | { authorized: false; reason: string };

async function createLlmRouteEgressAuthority<TValue>(
  createAuthority: () => Promise<TValue>
): Promise<LlmRouteEgressAuthorityResult<TValue>> {
  try {
    return { authorized: true, value: await createAuthority() };
  } catch (error) {
    if (error instanceof AiEgressAuthorityError) {
      return reject(error.message);
    }
    return reject('Invalid LLM request');
  }
}

function authorizeLlmPayloadLimits(assertLimits: () => void): IpcAuthorizationResult {
  try {
    assertLimits();
    return AUTHORIZED;
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'Invalid LLM request payload');
  }
}
