export type StoreCorruptionReason =
  | "malformed_json"
  | "invalid_envelope"
  | "checksum_mismatch"
  | "runtime_schema_invalid";

export class StorePathError extends Error {
  readonly code = "store_path_error" as const;
  readonly storePath: string;

  constructor(storePath: string, message = "Local JSON store path is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "StorePathError";
    this.storePath = storePath;
  }
}

export class StoreLockedError extends Error {
  readonly code = "store_locked" as const;
  readonly canonicalStorePath: string;

  constructor(canonicalStorePath: string, message = "Local JSON store is locked", options?: ErrorOptions) {
    super(message, options);
    this.name = "StoreLockedError";
    this.canonicalStorePath = canonicalStorePath;
  }
}

export class LeaseLostError extends Error {
  readonly code = "store_lease_lost" as const;
  readonly canonicalStorePath: string;

  constructor(canonicalStorePath: string, message = "Local JSON writer lease was lost", options?: ErrorOptions) {
    super(message, options);
    this.name = "LeaseLostError";
    this.canonicalStorePath = canonicalStorePath;
  }
}

export class AdapterClosedError extends Error {
  readonly code = "storage_adapter_closed" as const;

  constructor() {
    super("Local JSON storage adapter is closed");
    this.name = "AdapterClosedError";
  }
}

export class StoreCorruptionError extends Error {
  readonly code = "store_corrupt" as const;
  readonly reason: StoreCorruptionReason;

  constructor(reason: StoreCorruptionReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StoreCorruptionError";
    this.reason = reason;
  }
}

export class UnsupportedStoreSchemaVersionError extends Error {
  readonly code = "unsupported_store_schema_version" as const;
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(`Unsupported Local JSON store schema version: ${schemaVersion}`);
    this.name = "UnsupportedStoreSchemaVersionError";
    this.schemaVersion = schemaVersion;
  }
}

export class StoreGenerationOverflowError extends Error {
  readonly code = "store_generation_overflow" as const;
  readonly storeGeneration: number;

  constructor(storeGeneration: number) {
    super(`Local JSON store generation cannot advance beyond ${storeGeneration}`);
    this.name = "StoreGenerationOverflowError";
    this.storeGeneration = storeGeneration;
  }
}

export type AtomicStoreWriteStage =
  | "open_temp"
  | "write_temp"
  | "fsync_temp"
  | "close_temp"
  | "rename"
  | "fsync_directory"
  | "cleanup_temp";

export class AtomicStoreWriteError extends Error {
  readonly code = "atomic_store_write_failed" as const;
  readonly stage: AtomicStoreWriteStage;
  readonly path: string;

  constructor(stage: AtomicStoreWriteStage, path: string, options?: ErrorOptions) {
    super(`Atomic Local JSON store write failed during ${stage}`, options);
    this.name = "AtomicStoreWriteError";
    this.stage = stage;
    this.path = path;
  }
}

export class StoreDurabilityError extends Error {
  readonly code = "store_durability_unconfirmed" as const;
  readonly commitState = "renamed_not_durably_confirmed" as const;
  readonly committedGeneration: number;

  constructor(committedGeneration: number, options?: ErrorOptions) {
    super("Local JSON store was renamed but directory durability was not confirmed", options);
    this.name = "StoreDurabilityError";
    this.committedGeneration = committedGeneration;
  }
}

export class DuplicateRecordError extends Error {
  readonly code = "duplicate_storage_record" as const;
  readonly collection: string;

  constructor(collection: string, message = `Duplicate record in ${collection}`) {
    super(message);
    this.name = "DuplicateRecordError";
    this.collection = collection;
  }
}

export class AppendOnlyViolationError extends Error {
  readonly code = "append_only_violation" as const;
  readonly collection: string;

  constructor(collection: string, message = `Append-only constraint violated in ${collection}`) {
    super(message);
    this.name = "AppendOnlyViolationError";
    this.collection = collection;
  }
}
