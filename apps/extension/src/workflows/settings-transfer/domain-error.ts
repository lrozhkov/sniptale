export class SettingsTransferDomainError extends Error {
  constructor(
    readonly domainId: string,
    message: string
  ) {
    super(message);
    this.name = 'SettingsTransferDomainError';
  }
}

export function failSettingsTransferDomain(domainId: string): never {
  throw new SettingsTransferDomainError(domainId, `Invalid settings domain payload: ${domainId}`);
}
