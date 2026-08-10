export class StaleImageWorkspaceError extends Error {
  constructor(readonly aggregateId: string) {
    super('Image workspace changed before this operation completed.');
    this.name = 'StaleImageWorkspaceError';
  }
}

export class ImageAggregateNotFoundError extends Error {
  constructor(readonly aggregateId: string) {
    super('Image aggregate was not found.');
    this.name = 'ImageAggregateNotFoundError';
  }
}

export class ImagePresentationNotCurrentError extends Error {
  constructor(readonly aggregateId: string) {
    super('Image preview is not current.');
    this.name = 'ImagePresentationNotCurrentError';
  }
}

export class ImageAggregateCollisionError extends Error {
  constructor(readonly aggregateId: string) {
    super('An image aggregate already exists with the requested copy id.');
    this.name = 'ImageAggregateCollisionError';
  }
}
