# Puma Launcher

A modern, open-source Minecraft: Java Edition launcher built with Electron, React and TypeScript.
It is modelled on the most active open-source launchers, checked in October 2026:

| Project | Activity in 2026 | Latest release | What we took from it |
| --- | --- | --- | --- |
| **Prism Launcher** (most active) | ~1,550 commits, 52 contributors | 11.1.1 | Instance model, mod loaders through Prism's metadata server, ForgeWrapper for modern Forge/NeoForge, Temurin Java auto-install, mod management |
| **HMCL** | ~900 commits, 37 contributors | 3.17.0 | One-click Mojang Java runtimes, authlib-injector accounts, Modrinth downloads |
| ElyPrism / Fjord / Freesm | Prism forks that track upstream | 11.1.1-based | Third-party login servers (Ely.by, custom authlib-injector servers) |

![Home screen](docs/screenshots/home.png)

| Feature | Comes from | How it works here |
| --- | --- | --- |
| Always up-to-date versions | HMCL, Prism | Mojang's `version_manifest_v2.json`, re-checked in the background (every 10 min by default). New releases and snapshots trigger a notification. |
| Fabric, Quilt, Forge, NeoForge | Prism | Loader versions and libraries come from Prism's metadata server (`meta.prismlauncher.org`), which is updated within hours of each loader release. Components are applied over vanilla the same way Prism's `LaunchProfile` does. Modern Forge/NeoForge run through Prism's **ForgeWrapper**, which runs the official installer steps on first launch. Legacy Forge (1.12.2 and older) uses LaunchWrapper tweakers. |
| One-click Java | HMCL, Prism | Mojang's own runtimes first (Java 8/16/17/21/25), then **Eclipse Temurin** from Prism's metadata for anything Mojang doesn't ship (Linux ARM64, newer Java). You never need to install Java yourself: the right version starts downloading as soon as you create an instance (or change its version), so it is ready before you press **Play**. Java installed on your PC is only used if you pick it for an instance, turn automatic downloads off, or the download fails. |
| Use the Java already on your PC | Prism forks | Scans `JAVA_HOME`, `PATH` and the usual install folders. Each instance can be pinned to any detected Java or a custom path. |
| Mods from Modrinth | Prism, HMCL | Search mods compatible with the instance's loader and version, install them with their required dependencies (SHA-1 verified), and enable, disable or delete installed mods. |
| Isolated instances | Prism | Each instance has its own game folder, loader, Java, memory, JVM arguments and window size. |
| Accounts | HMCL, Prism, ElyPrism, Fjord | Microsoft (device code), offline, and **authlib-injector** servers (Ely.by, LittleSkin or any custom Yggdrasil server). Tokens are encrypted with the OS keychain. |

No code was copied from HMCL or Prism Launcher. The launcher uses their public metadata services and the
ForgeWrapper and authlib-injector jars at runtime. It is licensed GPL-3.0-or-later, the same licence as both projects.

## Features

- Login screen: Microsoft, offline, or Ely.by / LittleSkin / custom server, plus saved accounts to switch between
- Home screen with an animated gradient hero, latest release/snapshot cards and a large **Play** button
- Instances: create with any version and mod loader; edit version, loader, Java, memory, JVM args and resolution
- Mods: Modrinth browser with dependency resolution, plus installed-mod list with enable, disable and delete
- Versions browser: releases, snapshots, beta and alpha, with search and "installed" badges
- Java manager: one-click Mojang and Temurin runtimes plus the Java installations found on this PC
- Download manager: parallel downloads with SHA-1/SHA-256 checks, retries and live progress
- Game console showing the game log (log4j XML converted to readable lines), with errors highlighted

| New instance | Mods | Java |
| --- | --- | --- |
| ![New instance](docs/screenshots/new-instance.png) | ![Mods](docs/screenshots/mods.png) | ![Java](docs/screenshots/java.png) |

### Tested

Each of these was installed and launched from a clean data folder on Linux:
vanilla 26.3 (Java 25) and 1.12.2 (Java 8), Fabric 0.20.1 on 26.3 with Fabric API from Modrinth,
NeoForge 26.3.0.99, Forge 52.1.20 on 1.21.1, and Forge 14.23.5 on 1.12.2.

The test machine has no GPU, so vanilla 26.3 was also run with Mesa's software renderer (llvmpipe/lavapipe)
on a virtual display. The game reached the title screen and loaded into a new singleplayer world:

| Title screen | In a world |
| --- | --- |
| ![Title screen](docs/screenshots/in-game-title.png) | ![In game](docs/screenshots/in-game-world.png) |

### Platforms

| Platform | Status |
| --- | --- |
| Windows 10/11 (x64) | Supported: Mojang Java for every version. Not tested on real hardware yet. |
| macOS Intel | Supported: Mojang Java for every version, native window buttons. Not tested on real hardware yet. |
| macOS Apple Silicon (M1–M4) | Minecraft 1.19 and newer run natively with Mojang's ARM Java (17, 21, 25). Older versions use LWJGL 2 without ARM builds and are not supported yet. |
| Linux x64 / ARM64 | Tested on x64. ARM64 gets Java from Eclipse Temurin. |

### Download the installers

GitHub Actions builds every installer automatically (`.github/workflows/build.yml`):

- **Any push:** open the **Actions** tab, pick the latest "Build installers" run, and download the
  `PumaLauncher-Windows`, `PumaLauncher-macOS` or `PumaLauncher-Linux` artifact at the bottom of the page.
- **A release:** in the **Actions** tab, open "Build installers", click **Run workflow** and enter a version such as
  `v0.3.0`; or push a version tag (`git tag v0.3.0 && git push origin v0.3.0`). The installers are attached to a new
  GitHub Release.

| File | For |
| --- | --- |
| `PumaLauncher-<version>-windows-x64-setup.exe` | Windows 10/11 |
| `PumaLauncher-<version>-macos-arm64.dmg` | Macs with Apple chips (M1–M4) |
| `PumaLauncher-<version>-macos-x64.dmg` | Macs with Intel chips |
| `PumaLauncher-<version>-linux-x86_64.AppImage` / `-amd64.deb` | Linux |

You can also build locally with `npm run dist` on each OS: `.exe` (NSIS) on Windows, `.dmg` on macOS, AppImage/`.deb`
on Linux. Without code signing, Windows SmartScreen and macOS Gatekeeper show a warning the first time
(on macOS: right-click the app, then **Open**). Signing needs a code-signing certificate on Windows and an Apple
Developer ID on macOS.

## Getting started

```bash
npm install
npm run dev        # start with hot reload
npm run build      # production build into out/
npm run dist       # package installers into release/ (electron-builder)
npm run typecheck
```

Requires Node.js 20 or newer.

### Where data is stored

| OS | Folder |
| --- | --- |
| Windows | `%APPDATA%\puma-launcher` |
| macOS | `~/Library/Application Support/puma-launcher` |
| Linux | `~/.config/puma-launcher` |

To use another folder, set the `PUMA_HOME` environment variable. Data from older versions (the `txtaan-launcher` folder, from before the rename) is moved to the new folder automatically on first start. The layout follows `.minecraft`
(`versions/`, `libraries/`, `assets/`), plus `runtime/` for downloaded Java and `instances/` for instances.

### Microsoft login setup

Microsoft requires every launcher to use its own Azure application:

1. In the [Azure portal](https://portal.azure.com) go to **App registrations → New registration**.
   Choose **Personal Microsoft accounts only**.
2. Under **Authentication**, turn on **Allow public client flows**. This enables the device-code flow.
3. Copy the **Application (client) ID** into **Settings → Accounts** in the launcher, or set the
   `PUMA_MS_CLIENT_ID` environment variable.
4. New Azure apps also need Mojang's approval before they can use the Minecraft API. Submit the
   [Minecraft API access form](https://aka.ms/mce-reviewappid). Until it is approved, sign-in stops
   at the Minecraft step with HTTP 403.

Offline mode works without any of this.

## Project layout

```
src/
  main/            Electron main process
    core/
      versions.ts  Mojang version manifest + background refresh
      meta.ts      Prism metadata client (mod loaders, intermediary mappings)
      mods.ts      Modrinth search/install and local mod management
      archive.ts   zip/tar extraction
      install.ts   version JSON resolution, libraries, natives, assets
      java.ts      Java detection + Mojang / Temurin runtime downloads
      launch.ts    argument building and process spawning
      auth.ts      Microsoft (device code), offline and authlib-injector accounts
      instances.ts instance storage
      http.ts      downloads with SHA-1 checks, retries and concurrency
  preload/         typed, sandboxed IPC bridge (window.launcher)
  renderer/        React UI
    src/styles/theme.css  all colours, gradients and radii (edit this file to re-theme)
    src/styles/app.css    layout and components
    src/pages/            Login, Home, Instances, Versions, Java, Settings
  shared/types.ts  types shared by all three layers
```

### Browser preview (for UI work)

`npm run preview:web` runs the real React UI in a normal browser, with live reload, against a stand-in backend
(`preview/mock-launcher.ts`) and a snapshot of real Mojang/Prism/Modrinth data (`preview/sample-data.json`).
Downloads and launches are simulated, so you can click through every screen without Electron or Minecraft.
`npm run build:preview` produces a single shareable file, `out/preview/index.html`.

### Changing the UI

The UI only talks to the launcher through `window.launcher` (see `src/preload/index.ts`), so the
renderer can be redesigned or replaced freely. To change the look, start with the tokens in
`src/renderer/src/styles/theme.css`, for example `--hero-gradient` for the home screen gradient
and `--brand-gradient` for buttons.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). Minecraft is a trademark of Mojang AB; this project is
not affiliated with Mojang or Microsoft.
