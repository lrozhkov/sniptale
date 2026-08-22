interface BufferedLiveVideoFrame {
  frame: VideoFrame;
  timestampSeconds: number;
}

/** Disposable burst buffer between real-time capture and sequential encoder input. */
export class LiveVideoFrameBuffer {
  private readonly frames: BufferedLiveVideoFrame[] = [];
  private inputClosed = false;
  private aborted = false;
  private frameWaiter: (() => void) | null = null;
  private spaceWaiter: (() => void) | null = null;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Live video frame buffer capacity must be a positive integer.');
    }
  }

  get depth(): number {
    return this.frames.length;
  }

  async waitForSpace(canBypassCapacity: () => boolean = () => false): Promise<boolean> {
    while (
      !this.aborted &&
      !this.inputClosed &&
      this.frames.length >= this.capacity &&
      !canBypassCapacity()
    ) {
      await new Promise<void>((resolve) => {
        this.spaceWaiter = resolve;
      });
    }
    return !this.aborted && !this.inputClosed;
  }

  notifyProducer(): void {
    this.spaceWaiter?.();
    this.spaceWaiter = null;
  }

  enqueue(entry: BufferedLiveVideoFrame): boolean {
    if (this.aborted || this.inputClosed || this.frames.length >= this.capacity) return false;
    this.frames.push(entry);
    this.frameWaiter?.();
    this.frameWaiter = null;
    return true;
  }

  async dequeue(): Promise<BufferedLiveVideoFrame | null> {
    while (!this.aborted && !this.inputClosed && this.frames.length === 0) {
      await new Promise<void>((resolve) => {
        this.frameWaiter = resolve;
      });
    }
    if (this.aborted) return null;
    const entry = this.frames.shift() ?? null;
    if (entry) {
      this.spaceWaiter?.();
      this.spaceWaiter = null;
    }
    return entry;
  }

  closeInput(): void {
    if (this.inputClosed || this.aborted) return;
    this.inputClosed = true;
    this.frameWaiter?.();
    this.frameWaiter = null;
    this.spaceWaiter?.();
    this.spaceWaiter = null;
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.frames.splice(0).forEach(({ frame }) => frame.close());
    this.frameWaiter?.();
    this.frameWaiter = null;
    this.spaceWaiter?.();
    this.spaceWaiter = null;
  }
}
