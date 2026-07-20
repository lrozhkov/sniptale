import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const codecsStylesheet = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('project-export codecs owner facade', () => {
  it('stays a thin re-export surface over the canonical codecs owner folder', () => {
    expect(codecsStylesheet.trim()).toBe(
      [
        "export { scaleBitrate } from './bitrate';",
        'export {',
        '  ensureMp4ExportSupport,',
        '  getSupportedMp4AudioEncoder,',
        '  getSupportedMp4VideoCodecProfiles,',
        '  getSupportedMp4VideoEncoder,',
        "} from './encoders/index';",
        [
          'export { closeEncoderQuietly, isAbortLikeError, normalizeError }',
          " from './errors';",
        ].join(''),
        "export { waitForEncoderQueueCapacity } from './queue';",
      ].join('\n')
    );
  });
});
