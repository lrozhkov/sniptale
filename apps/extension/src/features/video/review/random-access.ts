/** Rejects container-only key claims and recovery pictures that need another GOP. */
export function isIndependentReviewPacket(
  codec: string,
  data: Uint8Array,
  description: AllowSharedBufferSource | undefined,
  determinedType: 'key' | 'delta' | null
): boolean {
  if (determinedType !== 'key' || data.length === 0) return false;
  if (codec === 'vp8' || codec === 'vp9' || codec === 'av1') return true;
  if (codec !== 'avc' && codec !== 'hevc') return false;
  const config = description
    ? ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description)
    : null;
  const lengthIndex = codec === 'avc' ? 4 : 21;
  if (config && (config.length <= lengthIndex || config[0] !== 1)) return false;
  const units = config
    ? lengthPrefixedUnits(data, (config[lengthIndex]! & 3) + 1)
    : annexBUnits(data);
  if (!units?.length) return false;
  let picture = false;
  for (const unit of units) {
    const header = unit[0]!;
    if ((header & 0x80) !== 0) return false;
    if (codec === 'avc') {
      const type = header & 31;
      if (type >= 1 && type <= 5) {
        if (type !== 5) return false;
        picture = true;
      }
    } else {
      if (unit.length < 2 || (unit[1]! & 7) === 0) return false;
      const type = (header >> 1) & 63;
      if (type <= 31) {
        // BLA_N_LP and IDR only; CRA/recovery may retain leading-picture dependencies.
        if (type !== 18 && type !== 19 && type !== 20) return false;
        picture = true;
      }
    }
  }
  return picture;
}

function lengthPrefixedUnits(data: Uint8Array, lengthSize: number): Uint8Array[] | null {
  const units: Uint8Array[] = [];
  let position = 0;
  while (position < data.length) {
    if (position + lengthSize > data.length) return null;
    let length = 0;
    for (let index = 0; index < lengthSize; index++) length = length * 256 + data[position++]!;
    if (length === 0 || position + length > data.length) return null;
    units.push(data.subarray(position, position + length));
    position += length;
  }
  return units;
}

function annexBUnits(data: Uint8Array): Uint8Array[] | null {
  const units: Uint8Array[] = [];
  let start = -1;
  for (let position = 0; position + 2 < data.length; position++) {
    if (data[position] !== 0 || data[position + 1] !== 0) continue;
    const prefix =
      data[position + 2] === 1 ? 3 : data[position + 2] === 0 && data[position + 3] === 1 ? 4 : 0;
    if (!prefix) continue;
    if (start < 0 && data.subarray(0, position).some((value) => value !== 0)) return null;
    if (start >= 0) {
      if (position === start) return null;
      units.push(data.subarray(start, position));
    }
    start = position + prefix;
    position = start - 1;
  }
  if (start < 0 || start >= data.length) return null;
  units.push(data.subarray(start));
  return units;
}
