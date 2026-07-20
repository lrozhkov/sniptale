/** Returns whether frame-driven progress should be emitted for the frame. */
export function shouldSendFrameDrivenProgress(
  frameIndex: number,
  lastProgressFrame: number,
  totalFrames: number,
  fps: number
): boolean {
  return (
    frameIndex === totalFrames - 1 ||
    frameIndex - lastProgressFrame >= Math.max(1, Math.floor(fps / 3))
  );
}
