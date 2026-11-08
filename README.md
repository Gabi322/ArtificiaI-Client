# ArtificiaI Launcher

This repository builds a Windows launcher installer and a small downloader for distributing it.

- `Artificiai-Launcher-Setup.exe` installs the launcher with Electron and its required npm packages bundled in. Users do not need Node.js or npm.
- `Artificiai-Downloader.exe` fetches the latest installer from a public GitHub repository, verifies its SHA-256 checksum, and starts setup.

## Create the public GitHub repository

The beta ZIP did not include a GitHub repository. Create a **public** repository on GitHub (for example, `artificiai-launcher`) and upload the files from this folder. Keep `.github/workflows/release.yml` in that exact path. Do not upload `node_modules`; the workflow restores the locked dependencies with `npm ci`.

The downloader asks for the public repository as `owner/repository` and remembers it on that PC. Public access is needed so downloads work without a GitHub sign-in.

## Publish a release

1. In the repository, choose **Releases → Draft a new release**.
2. Create tag `v0.1.0`, enter a title, and publish the release.
3. GitHub Actions builds both Windows executables and attaches them plus `SHA256SUMS.txt` to that release.
4. When the workflow completes, share `Artificiai-Downloader.exe` from the release assets. It downloads and verifies the latest `Artificiai-Launcher-Setup.exe`.

The first release may show no assets while the workflow is building. Refresh the release page after the **Build launcher and downloader** workflow finishes.

For future updates, upload the new source and publish another release with a new tag, such as `v0.1.1`.

The downloader is a small Windows app built with the .NET Framework C# compiler. It requires Windows 10/11 with .NET Framework 4.8 or newer. The setup EXE bundles the Electron runtime and launcher packages.
