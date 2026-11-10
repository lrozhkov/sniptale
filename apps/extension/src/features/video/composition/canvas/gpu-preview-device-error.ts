/** Hardware availability/loss permits the existing renderer; invalid scene plans remain errors. */
export class GpuPreviewDeviceError extends Error {
  override name = 'GpuPreviewDeviceError';
}
