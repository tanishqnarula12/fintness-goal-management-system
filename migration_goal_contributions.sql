-- Migration: goal-level mapped assets + Create Log contribution ledger
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- It is safe to re-run: each column is only added if it does not already exist.
--
-- mapped_assets: which of the client's Asset Allocation holdings are earmarked
-- toward this goal's starting corpus, and how much of each. Kept separate from
-- current_inv (the manually-typed corpus) so the app can show, per asset,
-- "already used by other goals" and "still available" when mapping it to a
-- new goal. Amounts are NOT double-counted against the source asset — the app
-- computes availability as (asset value) - (sum mapped to this client's OTHER
-- goals), e.g.
--   [
--     { "id": "financial::Stocks / Shares", "sectionId": "financial", "label": "Stocks / Shares", "amount": 200000 }
--   ]
--
-- contributions: the "Create Log" ledger — a chronological record of real
-- money events that feed directly into the projection/SIP calculations (not
-- just chart annotations). Two types:
--   - "lumpsum": a one-time amount added to (or, if negative, withdrawn from)
--     the corpus on that date.
--   - "sip": a permanent change to the running monthly SIP from that date
--     forward (positive = increase, negative = decrease).
-- e.g.
--   [
--     { "id": "id_abc", "type": "lumpsum", "date": "2026-08-01", "amount": 100000 },
--     { "id": "id_xyz", "type": "sip", "date": "2027-01-01", "amount": -2000 }
--   ]

ALTER TABLE public.goals
    ADD COLUMN IF NOT EXISTS mapped_assets JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.goals
    ADD COLUMN IF NOT EXISTS contributions JSONB NOT NULL DEFAULT '[]'::jsonb;
