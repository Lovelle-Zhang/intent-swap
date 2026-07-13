import { createHash } from "node:crypto";

type CanonicalJsonPrimitive = null | boolean | string | number;
type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export class NonCanonicalJsonError extends TypeError {
  readonly code = "non_canonical_json" as const;
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Value at ${path} is not canonical JSON: ${reason}`);
    this.name = "NonCanonicalJsonError";
    this.path = path;
  }
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const commonLength = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < commonLength; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return leftPoints.length - rightPoints.length;
}

function canonicalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new NonCanonicalJsonError(path, "numbers must be finite");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new NonCanonicalJsonError(path, `${typeof value} values are not supported`);
  }

  if (ancestors.has(value)) {
    throw new NonCanonicalJsonError(path, "cyclic references are not supported");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const unexpectedKey = Reflect.ownKeys(value).find((key) => {
        if (typeof key === "symbol") {
          return true;
        }
        if (key === "length") {
          return false;
        }
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || String(index) !== key;
      });
      if (unexpectedKey !== undefined) {
        throw new NonCanonicalJsonError(path, "array properties must be indexed items only");
      }

      const result: CanonicalJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor) {
          throw new NonCanonicalJsonError(path, "sparse arrays are not supported");
        }
        if (descriptor.get || descriptor.set) {
          throw new NonCanonicalJsonError(
            `${path}[${index}]`,
            "accessor properties are not supported",
          );
        }
        result.push(canonicalize(descriptor.value, `${path}[${index}]`, ancestors));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new NonCanonicalJsonError(path, "only plain objects are supported");
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new NonCanonicalJsonError(path, "symbol keys are not supported");
    }

    const result = Object.create(null) as Record<string, CanonicalJsonValue>;
    const keys = Object.getOwnPropertyNames(value).sort(compareUnicodeCodePoints);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
        throw new NonCanonicalJsonError(`${path}.${key}`, "accessor properties are not supported");
      }
      result[key] = canonicalize(descriptor.value, `${path}.${key}`, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$", new Set()));
}

export function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}
