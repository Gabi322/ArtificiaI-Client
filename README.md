# ArtificiaI Launcher

This repository builds the Windows launcher installer, its startup bootstrapper, and an optional download helper.

- `Artificiai-Launcher-Setup.exe` installs the launcher with Electron and its required npm packages bundled in. Users do not need Node.js or npm.
- `Artificiai-Launcher-Bootstrap.exe` checks GitHub for a newer release, verifies and installs it, then opens ArtificiaI Launcher. The setup installs it and makes it the desktop and Start menu shortcut.
- `Artificiai-Downloader.exe` fetches the latest installer from a public GitHub repository, verifies its SHA-256 checksum, and starts setup.

## Create the public GitHub repository

The beta ZIP did not include a GitHub repository. Create a **public** repository on GitHub (for example, `artificiai-launcher`) and upload the files from this folder. Keep `.github/workflows/release.yml` in that exact path. Do not upload `node_modules`; the workflow restores the locked dependencies with `npm ci`.

The downloader asks for the public repository as `owner/repository` and remembers it on that PC. Public access is needed so downloads work without a GitHub sign-in.

## Publish a release

1. In the repository, choose **Releases → Draft a new release**.
2. Match the release tag to the app version in `package.json` (for example, `v0.1.5` for version `0.1.5`), enter a title, and publish the release.
3. GitHub Actions builds the launcher and bootstrapper, then attaches `latest.yml` plus the Windows blockmap required for launcher updates, along with the bootstrapper, downloader, and `SHA256SUMS.txt`.
4. When the workflow completes, share `Artificiai-Launcher-Setup.exe` with friends who want to install directly. `Artificiai-Downloader.exe` is an optional helper that fetches the latest installer and verifies its SHA-256 checksum.

## Launcher self-updates

The bootstrapper checks for updates before opening the launcher. Bump `version` in both `package.json` and `package-lock.json` for each release, then publish a release using the same version in its tag. Existing users can start the downloaded `Artificiai-Launcher-Bootstrap.exe` once to move to this startup flow; the next setup replaces the desktop and Start menu shortcuts so they open the bootstrapper.

The launcher and Windows executable use the A mark. Its in-app tile gradient responds to the accent and main launcher colors in Customization; the Windows executable icon uses the purple gradient from the supplied reference.

The built-in ArtificiaI Client profile uses Fabric. On first play it copies the bundled ArtificiaI client JAR into that profile and installs the matching Fabric API dependency, which the client needs for its Right Shift menu. User-created profiles remain fresh and do not receive the client mod automatically.

The first release may show no assets while the workflow is building. Refresh the release page after the **Build launcher and downloader** workflow finishes.

For future updates, upload the new source and publish another release with a new tag, such as `v0.1.6`.

The downloader is a small Windows app built with the .NET Framework C# compiler. It requires Windows 10/11 with .NET Framework 4.8 or newer. The setup EXE bundles the Electron runtime and launcher packages.
