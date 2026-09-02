export {
  openLocalJsonPayRunStorage,
  type LocalJsonPayRunStorage,
  type LocalJsonPayRunStorageOptions,
  type LocalJsonStorageDiagnostics,
} from "./local-json-storage";

export {
  openPayRunPersistence,
  type OpenPayRunPersistenceOptions,
  type PayRunPersistenceFactoryDependencies,
} from "./persistence-factory";

export { openPostgresPayRunStorage } from "./postgres/postgres-storage";
export type { SqlClient, SqlPool, SqlQueryResult, TrustedProjectContext } from "./postgres/sql";

export {
  AdapterClosedError,
  AppendOnlyViolationError,
  AtomicStoreWriteError,
  CommitOutcomeUnknownError,
  DuplicateRecordError,
  LeaseLostError,
  PersistenceUnavailableError,
  StoreCorruptionError,
  StoreDurabilityError,
  StoreGenerationOverflowError,
  StoreLockedError,
  StorePathError,
  UnsupportedStoreSchemaVersionError,
  UnsafeDatabaseRoleError,
} from "./errors";
