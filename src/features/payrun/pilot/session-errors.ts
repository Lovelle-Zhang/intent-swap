export class PilotSessionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PilotSessionNotFoundError extends PilotSessionError {
  constructor(message = "Pilot Session was not found", cause?: unknown) {
    super(message, "pilot_session_not_found", cause);
  }
}

export class PilotManifestValidationError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_manifest_invalid", cause);
  }
}

export class PilotStoreIntegrityError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_store_integrity_failed", cause);
  }
}

export class PilotScenarioMappingError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_scenario_mapping_invalid", cause);
  }
}

export class PilotPathBoundaryError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_path_boundary_failed", cause);
  }
}

export class PilotSessionIncompleteError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_session_incomplete", cause);
  }
}

export class PilotPublicationError extends PilotSessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "pilot_publication_failed", cause);
  }
}
