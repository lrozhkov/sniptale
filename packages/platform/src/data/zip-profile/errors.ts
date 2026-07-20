export type ZipCentralDirectoryErrorCode =
  | 'archive-invalid'
  | 'entry-collision'
  | 'entry-special'
  | 'entry-unsupported'
  | 'limit-exceeded';

export class ZipCentralDirectoryError extends Error {
  readonly code: ZipCentralDirectoryErrorCode;
  readonly path: string | null;

  constructor(code: ZipCentralDirectoryErrorCode, message: string, path: string | null = null) {
    super(message);
    this.name = 'ZipCentralDirectoryError';
    this.code = code;
    this.path = path;
  }
}
