/** Hardware availability/loss permits the existing renderer; invalid scene plans remain errors. */
export class GpuPreviewDeviceError extends Error {
  override name = 'GpuPreviewDeviceError';
}

/** Validation remains fatal and distinct from hardware fallback without logging driver text. */
export class GpuPreviewValidationError extends Error {
  override name = 'GpuPreviewValidationError';
}
