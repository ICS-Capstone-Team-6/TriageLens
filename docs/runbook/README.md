# Operations runbook

Procedures for operating TriageLens (TRD 14.3). Written in Sprint 4 by Nana Yaw (E14-02), after the release pipeline exists (E13-04). Until then each section is a placeholder. Do not invent commands; fill each section from the real pipeline.

Never put secrets, keys or tokens in this folder (Team Rules 6).

## Deploy

TODO (E13-04, E14-02).

## Roll back

TODO (E13-04, E14-02). Requirement: one-command rollback (TRD 14.2).

## Rotate keys

TODO (E14-02). Rotate any key that leaks (Team Rules 6).

## Publish a model version

TODO (E9-04, E2-05, E14-02). A new model follows: train, validate, freeze, sign, release (TRD 9.11).

## Handle an incident

TODO (E14-02). Baseline from TRD 11.4: any suspected leak is reported to the team lead at once; the team revokes keys, preserves logs, and follows the ethics committee's instructions.

## Backups

TODO (E13-04). Daily database backup; restore tested once before the final gate (TRD 14.3).
