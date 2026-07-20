import { expect, it } from 'vitest';

import { isPrivateNetworkHost } from './private-network-host';

it('detects loopback and private-network hostnames', () => {
  expect(isPrivateNetworkHost('localhost')).toBe(true);
  expect(isPrivateNetworkHost('localhost.')).toBe(true);
  expect(isPrivateNetworkHost('printer.local')).toBe(true);
  expect(isPrivateNetworkHost('printer.local.')).toBe(true);
  expect(isPrivateNetworkHost('foo.localhost.')).toBe(true);
  expect(isPrivateNetworkHost('127.0.0.1')).toBe(true);
  expect(isPrivateNetworkHost('10.1.2.3')).toBe(true);
  expect(isPrivateNetworkHost('172.16.0.1')).toBe(true);
  expect(isPrivateNetworkHost('192.168.1.10')).toBe(true);
  expect(isPrivateNetworkHost('[::1]')).toBe(true);
  expect(isPrivateNetworkHost('[fc00::1]')).toBe(true);
  expect(isPrivateNetworkHost('[fe90::1]')).toBe(true);
  expect(isPrivateNetworkHost('[febf::1]')).toBe(true);
  expect(isPrivateNetworkHost('[fec0::1]')).toBe(true);
  expect(isPrivateNetworkHost('[::ffff:127.0.0.1]')).toBe(true);
  expect(isPrivateNetworkHost('cdn.example.com')).toBe(false);
  expect(isPrivateNetworkHost('93.184.216.34')).toBe(false);
});
