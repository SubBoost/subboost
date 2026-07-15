import type { SubscriptionSource } from "./definitions";

export type SingleSourceImportOperation = {
  id: number;
  sourceId: string;
  fingerprint: string;
};

export type BatchSourceImportOperation = {
  id: number;
  sources: Array<{ sourceId: string; fingerprint: string }>;
};

export function buildSourceImportFingerprint(source: SubscriptionSource): string {
  return JSON.stringify([
    source.type,
    source.content,
    typeof source.tag === "string" ? source.tag : null,
    typeof source.nameTemplate === "string" ? source.nameTemplate : null,
    source.useProxyProviders === true,
    typeof source.userinfoUrl === "string" ? source.userinfoUrl : null,
    typeof source.userinfoUserAgent === "string" ? source.userinfoUserAgent : null,
  ]);
}

export class SourceImportOperationGuard {
  private sequence = 0;
  private readonly singleOperations = new Map<string, number>();
  private activeBatchId: number | null = null;

  startSingle(source: SubscriptionSource): SingleSourceImportOperation {
    this.activeBatchId = null;
    const operation = {
      id: ++this.sequence,
      sourceId: source.id,
      fingerprint: buildSourceImportFingerprint(source),
    };
    this.singleOperations.set(source.id, operation.id);
    return operation;
  }

  startBatch(sources: readonly SubscriptionSource[]): BatchSourceImportOperation {
    const operation = {
      id: ++this.sequence,
      sources: sources.map((source) => ({
        sourceId: source.id,
        fingerprint: buildSourceImportFingerprint(source),
      })),
    };
    this.singleOperations.clear();
    this.activeBatchId = operation.id;
    return operation;
  }

  cancelAll(): void {
    this.singleOperations.clear();
    this.activeBatchId = null;
  }

  ownsSingle(operation: SingleSourceImportOperation): boolean {
    return this.singleOperations.get(operation.sourceId) === operation.id;
  }

  isSingleCurrent(sources: readonly SubscriptionSource[], operation: SingleSourceImportOperation): boolean {
    if (!this.ownsSingle(operation)) return false;
    const current = sources.find((source) => source.id === operation.sourceId);
    return Boolean(current && buildSourceImportFingerprint(current) === operation.fingerprint);
  }

  finishSingle(operation: SingleSourceImportOperation): void {
    if (this.ownsSingle(operation)) this.singleOperations.delete(operation.sourceId);
  }

  ownsBatch(operation: BatchSourceImportOperation): boolean {
    return this.activeBatchId === operation.id;
  }

  isBatchCurrent(sources: readonly SubscriptionSource[], operation: BatchSourceImportOperation): boolean {
    if (!this.ownsBatch(operation)) return false;
    const currentById = new Map(sources.map((source) => [source.id, source]));
    return operation.sources.every(({ sourceId, fingerprint }) => {
      const current = currentById.get(sourceId);
      return Boolean(current && buildSourceImportFingerprint(current) === fingerprint);
    });
  }

  finishBatch(operation: BatchSourceImportOperation): void {
    if (this.ownsBatch(operation)) this.activeBatchId = null;
  }
}
