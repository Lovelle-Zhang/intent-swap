import { describe, expect, it } from "vitest";

import {
  canonicalClone,
  canonicalStringify,
  NonCanonicalJsonError,
  sha256Canonical,
} from "@/features/payrun/adapters/storage/canonical-json";

describe("canonical JSON", () => {
  it("sorts object keys recursively by Unicode code-point order", () => {
    const first = {
      z: 1,
      nested: { b: 2, a: 1 },
      "": "bmp",
      "😀": "astral",
    };
    const second = {
      "😀": "astral",
      "": "bmp",
      nested: { a: 1, b: 2 },
      z: 1,
    };

    const expected =
      '{"nested":{"a":1,"b":2},"z":1,"":"bmp","😀":"astral"}';
    expect(canonicalStringify(first)).toBe(expected);
    expect(canonicalStringify(second)).toBe(expected);
  });

  it("preserves array order while canonicalizing nested values", () => {
    expect(canonicalStringify([{ z: 1, a: 2 }, "second", null])).toBe(
      '[{"a":2,"z":1},"second",null]',
    );
  });

  it("preserves ordinary string keys that overlap object prototype names", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":"data"}');

    expect(canonicalStringify(value)).toBe(
      '{"__proto__":{"polluted":true},"constructor":"data"}',
    );
  });

  it.each([
    ["undefined root", undefined],
    ["undefined property", { value: undefined }],
    ["undefined array item", [undefined]],
    ["bigint", { value: 1n }],
    ["function", { value: () => undefined }],
    ["symbol value", { value: Symbol("value") }],
    ["NaN", { value: Number.NaN }],
    ["positive infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative infinity", { value: Number.NEGATIVE_INFINITY }],
    ["sparse array", new Array(1)],
    ["non-plain object", { value: new Date("2026-07-13T00:00:00.000Z") }],
    ["toJSON object", { value: { toJSON: () => "changed" } }],
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalStringify(value)).toThrowError(NonCanonicalJsonError);
  });

  it("rejects symbol-keyed objects", () => {
    const value = { regular: true, [Symbol("hidden")]: "not canonical" };

    expect(() => canonicalStringify(value)).toThrowError(NonCanonicalJsonError);
  });

  it("rejects symbol or named properties attached to arrays", () => {
    const symbolKeyed = ["item"];
    Object.assign(symbolKeyed, { [Symbol("hidden")]: true });
    const namedProperty = ["item"] as string[] & { note?: string };
    namedProperty.note = "not an array item";

    expect(() => canonicalStringify(symbolKeyed)).toThrowError(NonCanonicalJsonError);
    expect(() => canonicalStringify(namedProperty)).toThrowError(NonCanonicalJsonError);
  });

  it("rejects cyclic values", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(() => canonicalStringify(value)).toThrowError(NonCanonicalJsonError);
  });

  it("clones into detached canonical JSON data", () => {
    const original = { z: [{ b: 2, a: 1 }], a: "value" };
    const clone = canonicalClone(original);

    expect(clone).toEqual({ a: "value", z: [{ a: 1, b: 2 }] });
    expect(clone).not.toBe(original);
    expect(clone.z).not.toBe(original.z);
    expect(clone.z[0]).not.toBe(original.z[0]);
  });

  it("returns a lowercase SHA-256 digest of canonical serialization", () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(sha256Canonical({ a: 1, b: 2 })).toBe(
      sha256Canonical({ b: 2, a: 1 }),
    );
  });

  it("changes the checksum when any envelope content field changes", () => {
    const content = {
      schemaVersion: 1,
      storeGeneration: 3,
      writtenAt: "2026-07-13T00:00:00.000Z",
      payload: { payRuns: [] },
    };
    const checksums = [
      content,
      { ...content, schemaVersion: 2 },
      { ...content, storeGeneration: 4 },
      { ...content, writtenAt: "2026-07-13T00:00:01.000Z" },
      { ...content, payload: { payRuns: [{ id: "payrun-1" }] } },
    ].map(sha256Canonical);

    expect(new Set(checksums).size).toBe(checksums.length);
  });
});
