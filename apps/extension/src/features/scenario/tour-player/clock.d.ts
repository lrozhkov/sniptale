/** Millisecond clock with injected scheduling and no navigation authority. */
export function createTourClock(options: {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  onChange(elapsed: number, running: boolean): void;
  onComplete(): void;
}): {
  reset(duration: number): void;
  play(): void;
  pause(): void;
  seek(elapsed: number): void;
  readonly elapsed: number;
  dispose(): void;
};
