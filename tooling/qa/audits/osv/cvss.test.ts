import { describe, expect, it } from 'vitest';

import { classifyCvssEvidence } from './cvss.mjs';

describe('CVSS v2 and v3 classification', () => {
  it.each([
    ['CVSS_V2', 'CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:C/A:C'],
    ['CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
  ])('classifies critical %s vectors', (type, score) => {
    expect(classifyCvssEvidence({ type, score }, [])).toBe('CRITICAL');
  });

  it.each([
    ['CVSS_V2', 'CVSS:3.1/AV:N/AC:L/Au:N/C:C/I:C/A:C'],
    ['CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/C:L/I:H/A:H'],
  ])('rejects malformed or incompatible %s vectors', (type, score) => {
    expect(classifyCvssEvidence({ type, score }, [])).toBeNull();
  });
});

describe('CVSS v4 group provenance', () => {
  const validVector = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';

  it.each(['2.0', validVector])(
    'rejects v4 evidence without a related numeric group: %s',
    (score) => {
      expect(classifyCvssEvidence({ type: 'CVSS_V4', score }, [])).toBeNull();
    }
  );

  it('classifies a valid v4 vector through related numeric group severity', () => {
    expect(classifyCvssEvidence({ type: 'CVSS_V4', score: validVector }, ['LOW', 'CRITICAL'])).toBe(
      'CRITICAL'
    );
  });

  it('accepts v4 Safety impact values', () => {
    const safetyVector = validVector.replace('/SI:N/SA:N', '/SI:S/SA:S');
    expect(classifyCvssEvidence({ type: 'CVSS_V4', score: safetyVector }, ['HIGH'])).toBe('HIGH');
  });

  it.each(['CVSS:4.0/X:Y', 'CVSS:4.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', `${validVector}/AV:P`])(
    'rejects malformed or incompatible v4 vectors: %s',
    (score) => {
      expect(classifyCvssEvidence({ type: 'CVSS_V4', score }, ['CRITICAL'])).toBeNull();
    }
  );
});
