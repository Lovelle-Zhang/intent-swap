import { describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { AuthUnavailableError } from "@/features/payrun/hosted/errors";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";

describe("retryOnTransientUnavailable", () => {
  test("returns the result without retrying on success", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(retryOnTransientUnavailable(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  test("retries once and recovers from a transient auth outage", async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new AuthUnavailableError())
      .mockResolvedValue("recovered");
    await expect(retryOnTransientUnavailable(op)).resolves.toBe("recovered");
    expect(op).toHaveBeenCalledTimes(2);
  });

  test("retries once and recovers from a transient persistence outage", async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new PersistenceUnavailableError())
      .mockResolvedValue("recovered");
    await expect(retryOnTransientUnavailable(op)).resolves.toBe("recovered");
    expect(op).toHaveBeenCalledTimes(2);
  });

  test("does not retry a non-transient error", async () => {
    const op = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retryOnTransientUnavailable(op)).rejects.toThrow("boom");
    expect(op).toHaveBeenCalledTimes(1);
  });

  test("fails closed after one retry when the outage persists", async () => {
    const op = vi.fn().mockRejectedValue(new PersistenceUnavailableError());
    await expect(retryOnTransientUnavailable(op)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(op).toHaveBeenCalledTimes(2);
  });
});
