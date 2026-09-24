# Backup Consolidation Plan (Deferred)

## Status: FROZEN — Not a blocker, but technical debt.

## Problem
Two parallel backup systems write to db.backups with incompatible formats.

| System | Path | Format | Crypto | Key |
|--------|------|--------|--------|-----|
| Modern | src/features/backup/services/ | ZIP + JSON | AES-CBC | Client |
| Legacy | src/services/backupService.ts | PFBACKUP binary | AES-GCM | Server env |

## Impact
Backups created by one CANNOT be restored by the other.

## Decision
Defer consolidation. Keep both frozen for now.

## Migration Plan (Future Phase)
1. Audit each of the 8 legacy callers.
2. Decide on canonical format (likely Modern + server-side crypto).
3. Migrate callers one at a time.
4. Delete legacy service.

## Do Not
- Do NOT add new callers to legacy service.
- Do NOT modify legacy encryption.
- Do NOT delete either service until migration is complete.
