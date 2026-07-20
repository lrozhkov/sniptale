import { createAiPrivacyProof, type LlmPrivacyPayload } from '../../../features/ai/privacy';

export async function withPrivacyProof<T extends LlmPrivacyPayload>(
  payload: T
): Promise<T & { privacyProof: Awaited<ReturnType<typeof createAiPrivacyProof>> }> {
  return {
    ...payload,
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
}
