type ProjectExportInputErrorCode =
  | 'capacityExceeded'
  | 'inputIntegrityFailure'
  | 'inputMissing'
  | 'jobConflict'
  | 'quotaExceeded';

export class ProjectExportInputError extends Error {
  readonly code: ProjectExportInputErrorCode;

  constructor(code: ProjectExportInputErrorCode) {
    super(`Project export input handoff failed: ${code}`);
    this.name = 'ProjectExportInputError';
    this.code = code;
  }
}

export function failProjectExportInput(code: ProjectExportInputErrorCode): never {
  throw new ProjectExportInputError(code);
}
