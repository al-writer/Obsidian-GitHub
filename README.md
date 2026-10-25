# Qoima Sync

**English** · [Русский](README.ru.md)

Sync your Obsidian vault with a GitHub repository — automatically on startup, on a schedule and on quit, or on demand. *Qoima* (қойма) means "vault" in Kazakh.

- Works through the GitHub REST API: no `git` installation needed, works on desktop and mobile.
- No third-party dependencies — only the Obsidian API.
- Interface in English, Russian and Kazakh. By default it follows the Obsidian language.

## Features

- **Sync on startup**, **every N minutes** and **on quit** (desktop), each can be turned off.
- **Manual sync**: the *Sync now* command, the ribbon button, or a click on the status bar.
- **Status** in the status bar (`GitHub: synced at 14:05`, errors, conflicts) and in notifications. Background syncs stay quiet unless something changed.
- **Branch selection** in the settings, with suggestions loaded from the repository. A missing branch is created from the default branch.
- **Mass deletion protection**: the sync stops if it would delete more than half of the files.

## How syncing works

Like git, every file is compared in three versions: local, on GitHub, and as of the last sync (the base).

| Situation | Result |
|---|---|
| Changed on one side only | The change is applied to the other side |
| Deleted on one side, unchanged on the other | Deleted there too (locally — to the trash) |
| Deleted on one side, changed on the other | The change wins, the file is restored |
| Text file changed on both sides in different places | Merged line by line automatically, like `git merge` |
| Same lines changed, or a binary file | Conflict: the local version stays, the GitHub version is saved next to it as `note (conflict 2026-10-24 19-30-12).md` |

All changes are pushed as a single commit. GitHub limits how fast files can be created, so the first upload of a large vault with many images can take a while: when the limit is hit, the plugin waits and continues. If someone pushes to the branch during a sync, the sync starts over with the new state.

Hidden files and folders (starting with `.`), including `.obsidian`, are not synced.

## Network use and accounts

- A **GitHub account** and a personal access token are required.
- The plugin only talks to the **GitHub REST API** (`api.github.com`) to read and write files in the repository you configure. There are no other network requests and no telemetry.
- The token is stored locally in the plugin settings and is only sent to GitHub.

## Installation

Install **Qoima Sync** from **Settings → Community plugins → Browse**, then enable it.

Before it is available in the directory, you can install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat): run **BRAT: Add a beta plugin for testing** and enter `al-writer/Obsidian-GitHub`. Or download `main.js` and `manifest.json` from the [latest release](https://github.com/al-writer/Obsidian-GitHub/releases/latest) into `<vault>/.obsidian/plugins/qoima-sync/`.

## Setup

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to your vault repository and the **Contents: Read and write** permission.
2. In the plugin settings, enter the token, the repository owner and name, and the branch.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type check and production build
```

To release, bump the version (`npm version patch`), commit and push to `main`. GitHub Actions builds the plugin and publishes a release when `manifest.json` has a new version.

## License

[MIT](LICENSE)
