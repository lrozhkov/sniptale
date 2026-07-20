export const AI_CAPTURE_MODES = [
  'selected_editable',
  'explicit_form_text',
  'full_tree_explicit',
  'scenario_editor',
] as const;

export const AI_PAYLOAD_RISK_CLASSES = ['safe_text', 'form_text', 'sensitive_dom'] as const;

export type AiCaptureMode = (typeof AI_CAPTURE_MODES)[number];
export type AiPayloadRiskClass = (typeof AI_PAYLOAD_RISK_CLASSES)[number];

export type AiPrivacyProof = {
  captureMode: AiCaptureMode;
  createdAtEpochMs: number;
  generation: string;
  payloadHash: string;
  riskClass: AiPayloadRiskClass;
  sourceFrameId?: number | undefined;
  sourceOrigin?: string | null | undefined;
  sourceTabId?: number | undefined;
  userInitiatedAiExtraction: boolean;
};
