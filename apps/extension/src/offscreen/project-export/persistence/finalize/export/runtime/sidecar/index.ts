import { requestSidecarDownload } from './request';

function normalizeSidecarMimeType(type: string): string {
  const mimeType = type.split(';')[0]?.trim();
  return mimeType && mimeType.includes('/') ? mimeType : 'text/plain';
}

/** Request a sidecar-file download through the offscreen runtime bridge. */
export function downloadExportSidecar(blob: Blob, filename: string): void {
  void blob.text().then((content) => {
    requestSidecarDownload({
      content,
      filename,
      mimeType: normalizeSidecarMimeType(blob.type),
    });
  });
}
