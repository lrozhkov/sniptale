declare module '@webav/mp4box.js' {
  export interface Mp4BoxSampleDescription {
    avcC?: { write(stream: Mp4BoxDataStream): void };
    hvcC?: { write(stream: Mp4BoxDataStream): void };
    vpcC?: { write(stream: Mp4BoxDataStream): void };
  }

  export interface Mp4BoxSample {
    cts: number;
    data: ArrayBuffer;
    description?: Mp4BoxSampleDescription;
    dts: number;
    duration: number;
    is_rap: boolean;
    timescale: number;
    track_id: number;
  }

  export interface Mp4BoxVideoTrack {
    codec: string;
    duration: number;
    id: number;
    nb_samples: number;
    timescale: number;
    video?: {
      height: number;
      width: number;
    };
  }

  export interface Mp4BoxInfo {
    videoTracks?: Mp4BoxVideoTrack[];
  }

  export interface Mp4BoxFile {
    appendBuffer(buffer: ArrayBuffer & { fileStart?: number }): number;
    flush(): void;
    onError?: ((error: unknown) => void) | undefined;
    onReady?: ((info: Mp4BoxInfo) => void) | undefined;
    onSamples?: ((id: number, user: unknown, samples: Mp4BoxSample[]) => void) | undefined;
    releaseUsedSamples(id: number, sampleNumber: number): void;
    setExtractionOptions(
      id: number,
      user: unknown,
      options?: { nbSamples?: number; rapAlignement?: boolean }
    ): void;
    start(): void;
    stop(): void;
  }

  export class DataStream {
    static BIG_ENDIAN: boolean;
    buffer: ArrayBuffer;
    constructor(arrayBuffer?: ArrayBuffer | number, byteOffset?: number, endianness?: boolean);
  }

  export function createFile(keepMdatData?: boolean): Mp4BoxFile;
}
