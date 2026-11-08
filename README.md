# ArtificiaI Launcher

This repository builds a Windows launcher installer and a small downloader for distributing it.

- `Artificiai-Launcher-Setup.exe` installs the launcher with Electron and its required npm packages bundled in. Users do not need Node.js or npm.
- `Artificiai-Downloader.exe` fetches the latest installer from a public GitHub repository, verifies its SHA-256 checksum, and starts setup.

## Create the public GitHub repository

The beta ZIP did not include a GitHub repository. Create a **public** repository on GitHub (for example, `artificiai-launcher`) and upload the files from this folder. Keep `.github/workflows/release.yml` in that exact path. Do not upload `node_modules`; the workflow restores the locked dependencies with `npm ci`.

The downloader asks for the public repository as `owner/repository` and remembers it on that PC. Public access is needed so downloads work without a GitHub sign-in.

## Publish a release

1. In the repository, choose **Releases → Draft a new release**.
2. Match the release tag to the app version in `package.json` (for example, `v0.1.4` for version `0.1.4`), enter a title, and publish the release.
3. GitHub Actions builds the Windows installer and attaches `latest.yml` plus the Windows blockmap required for launcher updates, along with the downloader and `SHA256SUMS.txt`.
4. When the workflow completes, share `Artificiai-Launcher-Setup.exe` with friends who want to install directly. `Artificiai-Downloader.exe` is an optional helper that fetches the latest installer and verifies its SHA-256 checksum.

## Launcher self-updates

The launcher checks the public GitHub Releases page after startup, downloads newer versions in the background, and asks the player to restart to install. Bump `version` in both `package.json` and `package-lock.json` for every update, then publish a release using the same version in its tag. The first self-updating installer must be installed manually by existing users; versions built before updater support cannot update themselves. After that one-time update, future releases install through the launcher.

The launcher and Windows executable use the A mark. Its in-app tile gradient responds to the accent and main launcher colors in Customization; the Windows executable icon uses the purple gradient from the supplied reference.

The built-in ArtificiaI Client profile uses Fabric. On first play it copies the bundled ArtificiaI client JAR into that profile and installs the matching Fabric API dependency, which the client needs for its Right Shift menu. User-created profiles remain fresh and do not receive the client mod automatically.

The first release may show no assets while the workflow is building. Refresh the release page after the **Build launcher and downloader** workflow finishes.

For future updates, upload the new source and publish another release with a new tag, such as `v0.1.5`.

The downloader is a small Windows app built with the .NET Framework C# compiler. It requires Windows 10/11 with .NET Framework 4.8 or newer. The setup EXE bundles the Electron runtime and launcher packages.
