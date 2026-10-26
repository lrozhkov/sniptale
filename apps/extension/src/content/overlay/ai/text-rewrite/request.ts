import {
  createChromeAiSession,
  createChromeAiSystemPromptMessage,
} from '@sniptale/platform/browser/chrome-ai';
import type { AIModel } from '../../../../contracts/settings';
import type { AIProviderSelectorEntry } from '../../../../contracts/messaging/ai-settings-runtime';
import {
  CONTENT_TEXT_MAX_CHARS,
  CONTENT_TEXT_SYSTEM_PROMPT,
  CONTENT_TEXT_TIMEOUT_MS,
} from '../../../../contracts/ai/content-text';
import { assertContentAiPayloadLimits } from '../../../../contracts/ai/payload-limits';
import {
  createAiPrivacyProof,
  normalizeLlmPayloadForProvider,
} from '../../../../features/ai/privacy';
import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';
import { prepareProviderContentAiEgress } from '../../../../features/ai/content-egress-pipeline';
import { isChromeAiModelId } from '../../../../features/ai/chrome/constants';
import { requestLlmSessionToken } from '../../../../workflows/ai-session/llm-session';
import { runContentTextJob } from '../../../../workflows/ai-session/content-text';
import { requestChromeAiContentSystemPrompt } from '../../../../workflows/ai-settings/query';

interface TextReplacementRequest {
  text: string;
  prompt: string;
  sourceOrigin: string | null;
  model: AIModel;
  provider: AIProviderSelectorEntry | undefined;
  signal: AbortSignal;
}

async function runChromeTextRequest(args: {
  text: string;
  prompt: string;
  modelId: string;
  signal: AbortSignal;
}): Promise<string> {
  const controller = new AbortController();
  const signal = controller.signal;
  let session: Awaited<ReturnType<typeof createChromeAiSession>> | undefined;
  let destroyed = false;
  let finished = false;
  const destroy = () => {
    if (!session || destroyed) return;
    destroyed = true;
    session.destroy();
  };
  let rejectAbort: (error: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    destroy();
    rejectAbort(signal.reason);
  };
  const forwardAbort = () => controller.abort(args.signal.reason);
  const timer = setTimeout(() => controller.abort(new Error('timeout')), CONTENT_TEXT_TIMEOUT_MS);
  signal.addEventListener('abort', abort, { once: true });
  args.signal.addEventListener('abort', forwardAbort, { once: true });
  if (args.signal.aborted) forwardAbort();
  try {
    signal.throwIfAborted();
    const configuredPrompt = await Promise.race([
      requestChromeAiContentSystemPrompt(args.modelId),
      aborted,
    ]);
    signal.throwIfAborted();
    const creating = createChromeAiSession({
      signal,
      initialPrompts: createChromeAiSystemPromptMessage(
        `${configuredPrompt}\n\n${CONTENT_TEXT_SYSTEM_PROMPT}`
      ),
    }).then((created) => {
      session = created;
      if (finished || signal.aborted) {
        destroy();
        throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
      }
      return created;
    });
    const current = await Promise.race([creating, aborted]);
    signal.throwIfAborted();
    return await Promise.race([
      current.prompt(`Selected text:\n${args.text}\n\nUser instruction:\n${args.prompt}`, {
        signal,
      }),
      aborted,
    ]);
  } finally {
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    args.signal.removeEventListener('abort', forwardAbort);
    destroy();
  }
}

/** Sends only the disclosed text through the existing content privacy and provider authorities. */
export async function requestTextReplacement(args: TextReplacementRequest): Promise<string> {
  args.signal.throwIfAborted();
  if (args.text.length > CONTENT_TEXT_MAX_CHARS) throw new Error('too-large');
  if (!args.text.trim() || !args.prompt.trim()) throw new Error('invalid-request');
  assertContentAiPayloadLimits({ markdownData: args.text, prompt: args.prompt });
  const initialProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload: { markdownData: args.text },
    riskClass: 'safe_text',
    sourceOrigin: args.sourceOrigin,
    userInitiatedAiExtraction: true,
  });
  const normalized = await normalizeLlmPayloadForProvider({
    payload: { markdownData: args.text },
    privacyProof: initialProof,
  });
  args.signal.throwIfAborted();
  if (!normalized.markdownData?.trim()) throw new Error('invalid-request');
  const payload = { markdownData: normalized.markdownData };
  const privacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: normalized.riskClass,
    sourceOrigin: args.sourceOrigin,
    userInitiatedAiExtraction: true,
  });
  args.signal.throwIfAborted();
  if (isChromeAiModelId(args.model.id)) {
    const egress = await prepareProviderContentAiEgress({
      ...payload,
      privacyProof,
      prompt: args.prompt,
    });
    args.signal.throwIfAborted();
    if (egress.payloadKind !== 'markdown') throw new Error('invalid-request');
    const text = await runChromeTextRequest({
      text: egress.request.markdownData,
      prompt: egress.request.prompt,
      modelId: args.model.id,
      signal: args.signal,
    });
    args.signal.throwIfAborted();
    if (!text.trim()) throw new Error('invalid-response');
    if (text.length > CONTENT_TEXT_MAX_CHARS) throw new Error('too-large');
    return text;
  }
  const provider = args.provider;
  if (
    !provider ||
    provider.id !== args.model.providerId ||
    provider.connectionType !== 'openai-compatible' ||
    !provider.destinationBinding
  )
    throw new Error('model-unavailable');
  const authority = await createContentAiEgressAuthority({ payload, privacyProof });
  args.signal.throwIfAborted();
  const token = await requestLlmSessionToken('content-ai-pick', authority);
  args.signal.throwIfAborted();
  return runContentTextJob(
    {
      type: 'start',
      requestId: crypto.randomUUID(),
      text: payload.markdownData,
      prompt: args.prompt,
      modelId: args.model.id,
      approvedProviderId: provider.id,
      approvedDestination: provider.destinationBinding,
      approvedModelCode: args.model.modelCode,
      llmSessionToken: token,
      privacyProof,
    },
    args.signal
  );
}
