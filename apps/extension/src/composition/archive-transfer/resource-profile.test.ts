import { describe, expect, it } from 'vitest';
import { openArchiveReader } from './reader';
import { createArchiveMemorySink } from './test-support';
import { createArchiveWriter } from './writer';

const PROFILE = {
  maxArchiveBytes: 1024,
  maxEntries: 1,
  maxEntryBytes: 16,
  maxInflatedBytes: 16,
};

describe('archive hostile-input resource profiles', () => {
  it('enforces entry counts for readers and writers', async () => {
    const source = createArchiveMemorySink();
    const sourceWriter = createArchiveWriter(source.sink);
    await sourceWriter.addText('one.txt', 'one');
    await sourceWriter.addText('two.txt', 'two');
    await sourceWriter.close();

    await expect(openArchiveReader(source.blob(), { resourceProfile: PROFILE })).rejects.toThrow(
      'resource profile'
    );

    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink, { resourceProfile: PROFILE });
    await writer.addText('one.txt', 'one');
    await expect(writer.addText('two.txt', 'two')).rejects.toThrow('resource profile');
    await writer.abort();
  });

  it('rejects invalid profiles before allocating archive state', async () => {
    const invalid = { ...PROFILE, maxEntryBytes: 17 };
    expect(() =>
      createArchiveWriter(createArchiveMemorySink().sink, { resourceProfile: invalid })
    ).toThrow('exceeds its inflated byte budget');
    await expect(
      openArchiveReader(new Blob(['zip']), { resourceProfile: invalid })
    ).rejects.toThrow('exceeds its inflated byte budget');
  });
});
