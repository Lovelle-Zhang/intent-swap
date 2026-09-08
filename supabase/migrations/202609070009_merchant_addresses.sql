-- Merchant payout registry: the owner-approved on-chain payout address for each
-- merchant id. When set, on-chain execution verification (Base Sepolia) requires
-- the transfer to have gone to THIS address for that merchant — upgrading the
-- proof from "paid some address the agent named" to "paid the address the owner
-- approved for this merchant". Shape: { "<merchantId>": "0x<40 hex>" }. {} = none.
ALTER TABLE public.policies
  ADD COLUMN merchant_addresses jsonb NOT NULL DEFAULT '{}'::jsonb;
