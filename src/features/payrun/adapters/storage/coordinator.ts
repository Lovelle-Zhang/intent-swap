import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { canonicalClone, canonicalStringify } from "./canonical-json";
import {
  atomicReplaceLocalJsonStore,
  type DirectoryFsyncUnsupportedDiagnostic,
  type LocalJsonFileSystem,
} from "./local-json-file-system";
import {
  buildEmptyStoreEnvelope,
  createStoreEnvelope,
  nextStoreGeneration,
  parseLegacyStoreEnvelope,
  parseStoreEnvelope,
  validateStorePayload,
  type LocalJsonStoreEnvelope,
  type LocalJsonStorePayload,
} from "./store-envelope";
import {
  acquireWriterLease,
  canonicalizeStorePath,
  type ProcessProbe,
  type WriterLease,
} from "./writer-lease";

export interface MutableLocalJsonStorePayload {
  payRuns: LocalJsonStorePayload["payRuns"] extends readonly (infer T)[] ? T[] : never;
  approvals: LocalJsonStorePayload["approvals"] extends readonly (infer T)[] ? T[] : never;
  budgetReservations: LocalJsonStorePayload["budgetReservations"] extends readonly (infer T)[] ? T[] : never;
  fundingPreparations: LocalJsonStorePayload["fundingPreparations"] extends readonly (infer T)[] ? T[] : never;
  paymentExecutions: LocalJsonStorePayload["paymentExecutions"] extends readonly (infer T)[] ? T[] : never;
  ledgerJournals: LocalJsonStorePayload["ledgerJournals"] extends readonly (infer T)[] ? T[] : never;
  auditEvents: LocalJsonStorePayload["auditEvents"] extends readonly (infer T)[] ? T[] : never;
  domainOutboxEvents: LocalJsonStorePayload["domainOutboxEvents"] extends readonly (infer T)[] ? T[] : never;
  idempotencyRecords: LocalJsonStorePayload["idempotencyRecords"] extends readonly (infer T)[] ? T[] : never;
  inboxEvents: LocalJsonStorePayload["inboxEvents"] extends readonly (infer T)[] ? T[] : never;
}

export interface CoordinatorDependencies {
  readonly instanceId?: () => string;
  readonly readStore?: (path: string) => Promise<string>;
  readonly fileSystem?: LocalJsonFileSystem;
  readonly processProbe?: ProcessProbe;
  readonly createEnvelope?: typeof createStoreEnvelope;
  readonly beforeFinalLeaseRelease?: () => Promise<void>;
}

export interface CoordinatorOptions {
  readonly storePath: string;
  readonly now: () => string;
  readonly nextOperationId?: () => string;
  readonly onDiagnostic?: (
    canonicalStorePath: string,
    diagnostic: DirectoryFsyncUnsupportedDiagnostic,
  ) => void;
  readonly dependencies?: CoordinatorDependencies;
}

interface RegistryEntry {
  readonly coordinator: Promise<SharedStoreCoordinator>;
}

class CoordinatorReleasedError extends Error {}

const coordinatorRegistry = new Map<string, RegistryEntry>();

export class SharedStoreCoordinator {
  private queueTail: Promise<void> = Promise.resolve();
  private referenceCount = 0;
  private released = false;

  private constructor(
    readonly canonicalStorePath: string,
    readonly instanceId: string,
    private readonly lease: WriterLease,
    private readonly options: CoordinatorOptions,
    private readonly removeFromRegistry: () => void,
  ) {}

  static async create(
    canonicalStorePath: string,
    options: CoordinatorOptions,
    removeFromRegistry: () => void,
  ): Promise<SharedStoreCoordinator> {
    const instanceId = options.dependencies?.instanceId?.() ?? randomUUID();
    if (instanceId.length === 0) throw new Error("Local JSON coordinator instanceId cannot be empty");
    const lease = await acquireWriterLease({
      canonicalStorePath,
      instanceId,
      now: options.now,
      nextOperationId: options.nextOperationId,
      probeProcess: options.dependencies?.processProbe,
    });
    const coordinator = new SharedStoreCoordinator(
      canonicalStorePath,
      instanceId,
      lease,
      options,
      removeFromRegistry,
    );
    try {
      await coordinator.initializeOrValidate();
      return coordinator;
    } catch (error) {
      await lease.release().catch(() => undefined);
      throw error;
    }
  }

  async attach(): Promise<void> {
    await this.exclusive(async () => {
      this.referenceCount += 1;
    });
  }

  async detach(): Promise<void> {
    await this.exclusive(async () => {
      if (this.referenceCount === 0) return;
      this.referenceCount -= 1;
      if (this.referenceCount !== 0) return;
      try {
        await this.options.dependencies?.beforeFinalLeaseRelease?.();
        await this.lease.release();
      } finally {
        this.released = true;
        this.removeFromRegistry();
      }
    });
  }

  async read<T>(operation: (envelope: LocalJsonStoreEnvelope) => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => operation(await this.readEnvelope()));
  }

  async mutate<T>(
    operation: (payload: MutableLocalJsonStorePayload) => T | Promise<T>,
  ): Promise<T> {
    return this.transaction(operation);
  }

  async transaction<T>(
    operation: (payload: MutableLocalJsonStorePayload) => T | Promise<T>,
  ): Promise<T> {
    return this.exclusive(async () => {
      await this.lease.assertOwned();
      const current = await this.readEnvelope();
      const workingCopy = canonicalClone(current.payload) as MutableLocalJsonStorePayload;
      const result = await operation(workingCopy);
      const generation = nextStoreGeneration(current.storeGeneration);
      const validatedPayload = validateStorePayload(workingCopy);
      await this.lease.assertOwned();
      const createEnvelope = this.options.dependencies?.createEnvelope ?? createStoreEnvelope;
      const envelope = createEnvelope(validatedPayload, generation, this.options.now());
      await this.writeEnvelope(envelope);
      return result;
    });
  }

  private async initializeOrValidate(): Promise<void> {
    try {
      const text = await this.readStoreText();
      try {
        parseStoreEnvelope(text);
      } catch (error) {
        if (!(error instanceof Error) || !("schemaVersion" in error) || error.schemaVersion !== 1) {
          throw error;
        }
        const legacy = parseLegacyStoreEnvelope(text);
        await this.lease.assertOwned();
        await this.writeEnvelope(createStoreEnvelope(
          legacy.payload,
          nextStoreGeneration(legacy.storeGeneration),
          this.options.now(),
        ));
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      await this.lease.assertOwned();
      await this.writeEnvelope(buildEmptyStoreEnvelope(this.options.now()));
    }
  }

  private async readEnvelope(): Promise<LocalJsonStoreEnvelope> {
    return parseStoreEnvelope(await this.readStoreText());
  }

  private async readStoreText(): Promise<string> {
    const readStore = this.options.dependencies?.readStore ?? ((path: string) => readFile(path, "utf8"));
    return readStore(this.canonicalStorePath);
  }

  private async writeEnvelope(envelope: LocalJsonStoreEnvelope): Promise<void> {
    await atomicReplaceLocalJsonStore({
      canonicalStorePath: this.canonicalStorePath,
      instanceId: this.instanceId,
      serializedEnvelope: canonicalStringify(envelope),
      committedGeneration: envelope.storeGeneration,
      assertWriterLeaseOwned: () => this.lease.assertOwned(),
      fileSystem: this.options.dependencies?.fileSystem,
      nextOperationId: this.options.nextOperationId,
      onDiagnostic: (diagnostic) =>
        this.options.onDiagnostic?.(this.canonicalStorePath, diagnostic),
    });
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queueTail;
    let release!: () => void;
    this.queueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (this.released) throw new CoordinatorReleasedError("Local JSON coordinator is released");
      return await operation();
    } finally {
      release();
    }
  }
}

export async function attachSharedStoreCoordinator(
  options: CoordinatorOptions,
): Promise<SharedStoreCoordinator> {
  const canonicalStorePath = await canonicalizeStorePath(options.storePath);
  while (true) {
    let entry = coordinatorRegistry.get(canonicalStorePath);
    if (!entry) {
      let createdEntry!: RegistryEntry;
      const coordinator = SharedStoreCoordinator.create(canonicalStorePath, options, () => {
        if (coordinatorRegistry.get(canonicalStorePath) === createdEntry) {
          coordinatorRegistry.delete(canonicalStorePath);
        }
      });
      createdEntry = { coordinator };
      entry = createdEntry;
      coordinator.catch(() => {
        if (coordinatorRegistry.get(canonicalStorePath) === createdEntry) {
          coordinatorRegistry.delete(canonicalStorePath);
        }
      });
      coordinatorRegistry.set(canonicalStorePath, entry);
    }

    const coordinator = await entry.coordinator;
    try {
      await coordinator.attach();
      return coordinator;
    } catch (error) {
      if (!(error instanceof CoordinatorReleasedError)) throw error;
      if (coordinatorRegistry.get(canonicalStorePath) === entry) {
        coordinatorRegistry.delete(canonicalStorePath);
      }
    }
  }
}

function hasCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
