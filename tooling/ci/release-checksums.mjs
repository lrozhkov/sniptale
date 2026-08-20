export function parseSha256Sums(value, label) {
  return new Map(
    value
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
        if (!match) throw new Error(`Malformed ${label} checksum: ${line}`);
        return [match[2], match[1]];
      })
  );
}
