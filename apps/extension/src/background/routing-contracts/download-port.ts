interface DownloadPort {
  executeDownloadBlob(
    blob: Blob,
    filename: string,
    presetId?: string | null
  ): Promise<number | undefined>;
}

const unavailableDownloadPort: DownloadPort = {
  async executeDownloadBlob() {
    throw new Error('Background download port is not configured');
  },
};

let downloadPort = unavailableDownloadPort;

export function configureDownloadPort(port: DownloadPort): void {
  downloadPort = port;
}

export function executeDownloadBlob(
  blob: Blob,
  filename: string,
  presetId?: string | null
): Promise<number | undefined> {
  return downloadPort.executeDownloadBlob(blob, filename, presetId);
}
