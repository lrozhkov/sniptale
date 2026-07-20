const MAX_UI_FPS = 30;

export function resolvePlaybackPublishIntervalMs(projectFps: number): number {
  const fps = Number.isFinite(projectFps) ? Math.max(1, projectFps) : MAX_UI_FPS;
  return 1000 / Math.min(MAX_UI_FPS, fps);
}

export function shouldPublishPlaybackTime(
  now: number,
  lastPublishedAt: number,
  projectFps: number
): boolean {
  return now - lastPublishedAt >= resolvePlaybackPublishIntervalMs(projectFps) - 0.5;
}

export function resolvePlaybackFrameTime(time: number, duration: number, fps: number): number {
  const normalizedFps = Number.isFinite(fps) ? Math.max(1, fps) : MAX_UI_FPS;
  const normalizedDuration = Math.max(0, Number(duration) || 0);
  const frameIndex = Math.max(0, Math.round(Math.max(0, time) * normalizedFps));
  return Math.min(normalizedDuration, frameIndex / normalizedFps);
}
