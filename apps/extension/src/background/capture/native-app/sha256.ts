import { SHA256_INITIAL_STATE, SHA256_K } from './sha256-constants';

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function writeUint32(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value >>> 24;
  buffer[offset + 1] = value >>> 16;
  buffer[offset + 2] = value >>> 8;
  buffer[offset + 3] = value;
}

export class NativeSha256 {
  private readonly buffer = new Uint8Array(64);
  private bufferLength = 0;
  private bytesHashed = 0;
  private readonly state = new Uint32Array(SHA256_INITIAL_STATE);
  private readonly words = new Uint32Array(64);

  update(data: Uint8Array): void {
    this.bytesHashed += data.byteLength;
    let offset = this.fillPendingBlock(data);
    if (offset === data.byteLength) {
      return;
    }
    while (offset + 64 <= data.byteLength) {
      this.processBlock(data, offset);
      offset += 64;
    }
    this.buffer.set(data.subarray(offset), 0);
    this.bufferLength = data.byteLength - offset;
  }

  digestHex(): string {
    this.finish();
    return [...this.state].map((word) => word.toString(16).padStart(8, '0')).join('');
  }

  private fillPendingBlock(data: Uint8Array): number {
    if (this.bufferLength === 0) {
      return 0;
    }
    const needed = 64 - this.bufferLength;
    const copied = Math.min(needed, data.byteLength);
    this.buffer.set(data.subarray(0, copied), this.bufferLength);
    this.bufferLength += copied;
    if (this.bufferLength === 64) {
      this.processBlock(this.buffer, 0);
      this.bufferLength = 0;
    }
    return copied;
  }

  private finish(): void {
    const bitLengthHigh = Math.floor(this.bytesHashed / 0x20000000);
    const bitLengthLow = (this.bytesHashed << 3) >>> 0;
    this.buffer[this.bufferLength] = 0x80;
    this.buffer.fill(0, this.bufferLength + 1);
    if (this.bufferLength >= 56) {
      this.processBlock(this.buffer, 0);
      this.buffer.fill(0);
    }
    writeUint32(this.buffer, 56, bitLengthHigh);
    writeUint32(this.buffer, 60, bitLengthLow);
    this.processBlock(this.buffer, 0);
    this.bufferLength = 0;
  }

  private processBlock(data: Uint8Array, offset: number): void {
    this.prepareWords(data, offset);
    let [a, b, c, d, e, f, g, h] = [
      this.state[0]!,
      this.state[1]!,
      this.state[2]!,
      this.state[3]!,
      this.state[4]!,
      this.state[5]!,
      this.state[6]!,
      this.state[7]!,
    ];
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index]! + this.words[index]!) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
    }
    for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) {
      this.state[index] = (this.state[index]! + value) >>> 0;
    }
  }

  private prepareWords(data: Uint8Array, offset: number): void {
    for (let index = 0; index < 16; index += 1) {
      this.words[index] =
        (data[offset]! << 24) |
        (data[offset + 1]! << 16) |
        (data[offset + 2]! << 8) |
        data[offset + 3]!;
      offset += 4;
    }
    for (let index = 16; index < 64; index += 1) {
      this.words[index] =
        (this.words[index - 16]! +
          createMessageScheduleDelta(this.words, index - 15, index - 2) +
          this.words[index - 7]!) >>>
        0;
    }
  }
}

function createMessageScheduleDelta(words: Uint32Array, leftIndex: number, rightIndex: number) {
  const left = words[leftIndex]!;
  const right = words[rightIndex]!;
  const s0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
  const s1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
  return (s0 + s1) >>> 0;
}
