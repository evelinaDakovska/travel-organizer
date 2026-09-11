# Dev setup

Machine-level facts that are not visible from the code. Recorded so a session with no
conversation history can pick the project up without re-deriving them.

---

## 1. Where things are

| | |
|---|---|
| Working copy | `~/projects/travel-organizer` (IG-owned, Jamf-managed Mac) |
| Remote | `git@github.com:evelinaDakovska/travel-organizer.git` — personal GitHub, **private** |
| Android SDK | `~/Library/Android/sdk` |
| Emulator AVD | `Medium_Phone_API_36.1` (Google Play image, Android 16) |
| Physical device | Samsung Galaxy S26 Ultra — connect only when necessary, see `CLAUDE.md` §9 |

## 2. Git identity — deliberately split

Global identity is the **work** address; this repo overrides it locally. Personal commits must
never carry the work identity.

```
global      user.email  evelina.dakovska@ig.com        <- work, untouched
this repo   user.email  evelina.dakovska@gmail.com     <- set in .git/config
```

Verify after any clone or reconfigure:

```bash
git config user.email          # must be the gmail address
git config --global user.email # must remain the ig.com address
```

**A fresh clone does not carry this.** Re-set `user.email` locally before the first commit.

## 3. SSH

A dedicated key is used for personal GitHub, separate from the work GitLab key.

| Host | Key |
|---|---|
| github.com | `~/.ssh/id_ed25519_personal` |
| gitlab.com (work) | `~/.ssh/id_ed25519` (default, untouched) |

`~/.ssh/config`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

Check with `ssh -T git@github.com` → should greet `evelinaDakovska`.

## 4. Git hooks — global hook disabled for this repo

The machine has a **global** pre-commit hook at `~/.git-hooks/` that runs
`ggshield secret scan` against GitGuardian workspace `593257`, configured for work. It applies to
every repo on the machine by default.

This repo overrides it:

```
core.hooksPath = .githooks-disabled     # repo-local, in .git/config
```

Reasons: this is a personal repo, it has no secrets to leak (no backend, no API keys, by design),
and commit content should not transit a work-associated third-party token.

**Work repos are unaffected** — the override is repo-local and not committed. A fresh clone will
inherit the global hook again; re-apply if wanted:

```bash
git config core.hooksPath .githooks-disabled
```

## 5. Toolchain — verified 2026-09-11

| | Required | Present |
|---|---|---|
| JDK | 17 | Zulu 17.0.18 ✅ |
| Android SDK Platform | 36 (Android 16 "Baklava") | 35, 36, 36.1 ✅ |
| Build-tools | recent | 35 / 36 / 36.1 / 37.0.0-rc2 ✅ |
| Node | 20+ | 22.16.0 ✅ |
| adb | — | 37.0.0 ✅ |

No toolchain installation is needed — the machine is already a working React Native environment.

## 6. Running it

Expo Go **cannot** run this app: `expo-share-intent` contains native code, so a custom dev client
is required.

```bash
npx expo prebuild            # regenerates /ios /android — these are NOT committed (CNG)
npx expo run:android         # builds + installs the dev client, starts Metro
```

Emulator is the default target. For the physical device:

```bash
adb devices                  # requires USB debugging enabled on the phone
npx expo run:android --device
```

Afterwards: **Developer options → Revoke USB debugging authorizations.**

For real travel use, build and install a **release** build, not the dev build — a debuggable build
lets an authorised computer read the app's private sandbox (database and every imported PDF) via
`adb shell run-as`. See `CLAUDE.md` §9.

## 7. Push often

The laptop is IG-owned and Jamf-managed: it can be wiped remotely and is reclaimed on offboarding
or hardware rotation. **GitHub is the only off-device copy.** Treat the working copy as disposable.
