interface ScenarioEditorSelectionUrlArgs {
  projectId: string | null;
  stepId?: string | null;
}

export interface ScenarioEditorBrowserDriverPort {
  downloadBlob: (blob: Blob, filename: string) => void;
  replaceSelectionInUrl: (args: ScenarioEditorSelectionUrlArgs) => void;
}
