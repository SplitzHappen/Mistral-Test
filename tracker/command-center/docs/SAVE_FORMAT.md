# Save format and storage names

The Command Center keeps ONE save per device. Stage 1 changes none of this.

## The one save document

Stored as one record; shape (see `tracker/src/core/save.js`):

```json
{
  "app": "eveniunt-command-center",
  "v": 1,
  "updated": 0,
  "chars": [],
  "modules": { "tracker": {}, "atelier": {}, "submersibles": {}, "settings": {} },
  "device": {},
  "moved": {}
}
```

- `v` is the save version (`CC.VERSION = 1`); a higher `v` is refused with error code `newer`.
- `modules`: one section per module; the Tracker checks its own section, `save.js` checks the others
  and keeps a section it does not know (written by a newer app) as plain data instead of dropping it.
- Module sections merge in units two levels down (e.g. `atelier` → `chars` → `c1`); the Tracker's
  section is a raw pass-through.

## Storage names (all of them)

| Where | Name | Holds |
| --- | --- | --- |
| IndexedDB `eveniunt-command-center`, store `save`, key `main` | the one save | the save document above |
| IndexedDB `eveniunt-command-center`, store `save`, key `main-rev` | revision stamp | last write rev (for cloud merge) |
| localStorage `eveniunt-command-center-save` | fallback copy of the save | used when IndexedDB is unavailable |
| BroadcastChannel `eveniunt-command-center` | cross-tab save notices | not storage, listed for completeness |
| IndexedDB `eveniunt-tracker` → store `state` → key `main` | LEGACY Tracker save, read-only | copied into the one save on first run, never written or deleted |
| localStorage `eveniunt-tracker-state` | LEGACY Tracker save, read-only | same |
| localStorage `eveniunt-tracker-ui` | Tracker UI prefs (incl. the `look` appearance object) | theme key of the Tracker/Atelier look |
| localStorage `eveniunt-in-app` | in-app banner dismissal | device-local |
| localStorage `eveniunt-tracker-fired` | fired-notification marks | device-local |
| localStorage `eveniunt-cloud-device` | this device's cloud sync handle (`{ device: <64 hex> }`) | used to authenticate to the helper |
| localStorage `eveniunt-command-center-device` | per-device Command Center data (`installed`, `subs` sound/alerted marks) | device-local, never in the save |
| localStorage `eveniunt-subs-prices` | Universalis price cache `{ scope, at, prices }` | device-local, never in the save |
| sessionStorage `eveniunt-subs-ui` | Submersibles tab state | tab-local |
| sessionStorage `eveniunt-subs-push` | last push schedule sent | tab-local |
| sessionStorage `eveniunt-subs-reloaded` | one-shot reload guard | tab-local |

Published addresses: the Command Center manifest (`tracker/command-center/site/manifest.webmanifest`)
keeps `"id": "./"`, `"start_url": "./"`, `"scope": "./"` — unchanged.

## Backup files and transfer codes

- Backup file: JSON `{ app: 'eveniunt-command-center', v: 1, ... }` (`SAVE_TAG`, `BACKUP_V = 1` in
  `tracker/src/core/codec.js`). Files tagged `eveniunt-completionist-tracker` (pre-1C Tracker backups)
  are still read.
- Transfer codes: `EVT2-…` (carries all modules' sections) and legacy `EVT1-…` (Tracker only).
  Standard base64 in save codes, URL-safe base64 in transfer codes.
- Error codes: `newer`, `damaged`, `changed`, `too-large` (save/backup/transfer), plus cloud codes
  `offline`, `signed-out`, `not-signed-in`, `denied`, `state`, `helper`.
- Cleaning before each checker: strings cut at 20,000 characters, arrays at 5,000 items, depth 10;
  every checker idempotent. Storage fallbacks: IndexedDB, then localStorage, then memory.
