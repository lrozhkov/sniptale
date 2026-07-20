export type ScenarioRenderedAttachment = {
  dataUrl: string;
  filename: string;
  mimeType: string;
  stepId: string;
  stepNumber: number;
};

export type ScenarioRenderedAttachmentCandidate = ScenarioRenderedAttachment & {
  blob: Blob;
};
