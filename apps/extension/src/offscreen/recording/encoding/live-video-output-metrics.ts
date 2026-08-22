import type { EncodedPacket } from 'mediabunny';
import { evaluateLiveVideoByteBudget, evaluateLiveVideoKeyFrameBudget } from './live-video-budget';

type ObservedVideoPacket = Pick<EncodedPacket, 'byteLength' | 'duration' | 'timestamp' | 'type'>;

/** Owns encoded-packet accounting independently from capture and submission metrics. */
export class LiveVideoOutputMetrics {
  private actualKeyFrameBytes = 0;
  private actualKeyFrames = 0;
  private backwardTimestamps = 0;
  private duplicateTimestamps = 0;
  private encodedBytes = 0;
  private encodedFrames = 0;
  private firstTimestamp: number | null = null;
  private lastEndTimestamp: number | null = null;
  private lastKeyFrameTimestamp: number | null = null;
  private lastTimestamp: number | null = null;
  private maximumGopInterval: number | null = null;
  private minimumGopInterval: number | null = null;
  private totalGopInterval = 0;
  private totalPacketDuration = 0;

  observe(packet: ObservedVideoPacket): { firstPacket: boolean } {
    const firstPacket = this.encodedFrames === 0;
    this.encodedFrames += 1;
    this.encodedBytes += packet.byteLength;
    this.firstTimestamp ??= packet.timestamp;
    this.lastEndTimestamp = packet.timestamp + packet.duration;
    this.totalPacketDuration += packet.duration;
    if (this.lastTimestamp !== null) {
      if (packet.timestamp === this.lastTimestamp) this.duplicateTimestamps += 1;
      else if (packet.timestamp < this.lastTimestamp) this.backwardTimestamps += 1;
    }
    this.lastTimestamp = packet.timestamp;
    if (packet.type === 'key') this.observeKeyFrame(packet);
    return { firstPacket };
  }

  summarize(input: {
    configuredBitrate: number;
    forcedKeyFrames: number;
    keyFrameInterval: number;
  }) {
    const duration =
      this.firstTimestamp === null || this.lastEndTimestamp === null
        ? 0
        : this.lastEndTimestamp - this.firstTimestamp;
    return {
      actualFrameRate: duration > 0 ? this.encodedFrames / duration : 0,
      actualKeyFrameBytes: this.actualKeyFrameBytes,
      actualKeyFrames: this.actualKeyFrames,
      averageGopInterval:
        this.actualKeyFrames > 1 ? this.totalGopInterval / (this.actualKeyFrames - 1) : null,
      averageInterframeBytes:
        this.encodedFrames > this.actualKeyFrames
          ? (this.encodedBytes - this.actualKeyFrameBytes) /
            (this.encodedFrames - this.actualKeyFrames)
          : 0,
      backwardEncodedPacketTimestamps: this.backwardTimestamps,
      duplicateEncodedPacketTimestamps: this.duplicateTimestamps,
      duration,
      encodedVideoBytes: this.encodedBytes,
      encodedVideoBytesPerSecond: duration > 0 ? this.encodedBytes / duration : 0,
      encodedVideoFrames: this.encodedFrames,
      keyFrameByteShare: this.encodedBytes > 0 ? this.actualKeyFrameBytes / this.encodedBytes : 0,
      maximumGopInterval: this.maximumGopInterval,
      minimumGopInterval: this.minimumGopInterval,
      totalEncodedPacketDuration: this.totalPacketDuration,
      videoByteBudget: evaluateLiveVideoByteBudget({
        configuredBitrate: input.configuredBitrate,
        duration,
        encodedBytes: this.encodedBytes,
      }),
      videoKeyFrameBudget: evaluateLiveVideoKeyFrameBudget({
        actualKeyFrames: this.actualKeyFrames,
        configuredInterval: input.keyFrameInterval,
        duration,
        forcedKeyFrames: input.forcedKeyFrames,
      }),
    };
  }

  private observeKeyFrame(packet: ObservedVideoPacket): void {
    this.actualKeyFrames += 1;
    this.actualKeyFrameBytes += packet.byteLength;
    if (this.lastKeyFrameTimestamp !== null) {
      const interval = packet.timestamp - this.lastKeyFrameTimestamp;
      this.minimumGopInterval = Math.min(this.minimumGopInterval ?? interval, interval);
      this.maximumGopInterval = Math.max(this.maximumGopInterval ?? interval, interval);
      this.totalGopInterval += interval;
    }
    this.lastKeyFrameTimestamp = packet.timestamp;
  }
}
