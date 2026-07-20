export class AiEgressAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiEgressAuthorityError';
  }
}
