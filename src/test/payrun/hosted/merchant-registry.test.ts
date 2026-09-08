import { describe, expect, test } from "vitest";

import {
  isAddress, lookupMerchantAddress, merchantAddressesToText, parseMerchantAddresses,
  renderMerchantAddressField,
} from "@/features/payrun/hosted/merchant-registry";

const ADDR = "0x1111111111111111111111111111111111111111";

describe("isAddress", () => {
  test("accepts a 0x 40-hex address, rejects the rest", () => {
    expect(isAddress(ADDR)).toBe(true);
    expect(isAddress("0x1234")).toBe(false);           // too short
    expect(isAddress("1111111111111111111111111111111111111111")).toBe(false); // no 0x
    expect(isAddress("0xZZ11111111111111111111111111111111111111")).toBe(false); // non-hex
  });
});

describe("parseMerchantAddresses", () => {
  test("parses id = 0xaddr, lowercases, skips blanks", () => {
    const r = parseMerchantAddresses(`acme_api = 0xAbC1111111111111111111111111111111111111\n\n  \ndata_co=${ADDR}`);
    expect(r).toEqual({
      ok: true,
      addresses: { acme_api: "0xabc1111111111111111111111111111111111111", data_co: ADDR },
    });
  });
  test("rejects a malformed address with a clear error", () => {
    const r = parseMerchantAddresses("acme_api = 0xnope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("acme_api");
  });
});

describe("merchantAddressesToText + lookup", () => {
  test("round-trips and looks up by merchant id", () => {
    const map = { acme_api: ADDR };
    expect(merchantAddressesToText(map)).toBe(`acme_api = ${ADDR}`);
    expect(lookupMerchantAddress(map, "acme_api")).toBe(ADDR);
    expect(lookupMerchantAddress(map, "unknown")).toBeNull();
  });
});

describe("renderMerchantAddressField", () => {
  test("renders the textarea with the owner's typed value", () => {
    const html = renderMerchantAddressField(`acme_api = ${ADDR}`);
    expect(html).toContain('name="merchantAddresses"');
    expect(html).toContain(ADDR);
  });
});
