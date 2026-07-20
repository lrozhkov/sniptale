import { sanitizeFilename } from '../../filename';

/**
 * Build the finalized export filename from the project name, timestamp, and export extension.
 */
export function buildExportFilename(params: {
  extension: string;
  projectName: string;
  timestamp: string;
}): string {
  const projectName = sanitizeFilename(params.projectName || 'project-export');
  return `${projectName}-${params.timestamp}.${params.extension}`;
}
