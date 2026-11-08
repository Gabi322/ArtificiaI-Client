using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Artificiai.Bootstrapper
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            try
            {
                string current = Process.GetCurrentProcess().MainModule.FileName;
                string tempRoot = Path.GetFullPath(Path.GetTempPath());
                if (!Path.GetFullPath(current).StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase))
                {
                    string tempCopy = Path.Combine(tempRoot, "Artificiai-Launcher-Bootstrap-" + Guid.NewGuid().ToString("N") + ".exe");
                    File.Copy(current, tempCopy, false);
                    Process.Start(new ProcessStartInfo(tempCopy) { UseShellExecute = true });
                    return;
                }
            }
            catch { /* Fall back to running in place if a temporary copy cannot be started. */ }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new BootstrapperWindow());
        }
    }

    internal sealed class BootstrapperWindow : Form
    {
        private const string Repository = "Gabi322/ArtificiaI-Client";
        private const string InstallerName = "Artificiai-Launcher-Setup.exe";
        private static readonly HttpClient Http = CreateClient();
        private readonly Label status = new Label();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly Button action = new Button();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private string installedPath;

        public BootstrapperWindow()
        {
            Text = "Artificiai Launcher";
            ClientSize = new Size(440, 190);
            MinimumSize = new Size(456, 229);
            MaximumSize = new Size(456, 229);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(18, 22, 19);
            ForeColor = Color.FromArgb(238, 242, 234);
            Font = new Font("Segoe UI", 10F);

            Label title = new Label();
            title.Text = "ArtificiaI Launcher";
            title.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(25, 22);

            Label subtitle = new Label();
            subtitle.Text = "Checking for updates before opening the launcher.";
            subtitle.AutoSize = true;
            subtitle.Location = new Point(27, 61);
            subtitle.ForeColor = Color.FromArgb(158, 170, 154);

            status.SetBounds(27, 99, 386, 24);
            status.Text = "Starting…";
            status.ForeColor = Color.FromArgb(204, 214, 198);
            status.AutoEllipsis = true;

            progress.SetBounds(27, 128, 386, 9);
            progress.Style = ProgressBarStyle.Marquee;
            progress.MarqueeAnimationSpeed = 24;

            action.SetBounds(285, 151, 128, 28);
            action.Text = "Close";
            action.FlatStyle = FlatStyle.Flat;
            action.FlatAppearance.BorderColor = Color.FromArgb(57, 68, 57);
            action.BackColor = Color.FromArgb(29, 35, 30);
            action.ForeColor = Color.FromArgb(238, 242, 234);
            action.Visible = false;
            action.Click += delegate
            {
                if (installedPath != null && File.Exists(installedPath))
                    Process.Start(new ProcessStartInfo(installedPath) { UseShellExecute = true });
                Close();
            };

            Controls.AddRange(new Control[] { title, subtitle, status, progress, action });
            Shown += async delegate { await CheckUpdateAndLaunchAsync(); };
        }

        private async Task CheckUpdateAndLaunchAsync()
        {
            installedPath = FindInstalledLauncher();
            Version installedVersion = ReadInstalledVersion(installedPath);
            try
            {
                SetStatus("Checking the latest release…");
                Dictionary<string, object> release = await GetLatestReleaseAsync();
                string latestTag = Convert.ToString(release["tag_name"]);
                Version latestVersion = ParseVersion(latestTag);
                if (latestVersion == null) throw new InvalidOperationException("The latest release tag is not a valid version.");

                if (installedPath == null || installedVersion == null || latestVersion > installedVersion)
                {
                    await DownloadAndInstallAsync(release, installedPath != null);
                    installedPath = FindInstalledLauncher();
                }
                else
                {
                    SetStatus("You’re up to date. Opening ArtificiaI…");
                }

                if (installedPath == null || !File.Exists(installedPath))
                    throw new InvalidOperationException("The launcher was not found after setup finished.");

                Process.Start(new ProcessStartInfo(installedPath) { UseShellExecute = true });
                Close();
            }
            catch (Exception ex)
            {
                progress.Visible = false;
                SetStatus("Could not update/open the launcher: " + ex.Message);
                action.Visible = true;
                action.Text = installedPath != null && File.Exists(installedPath) ? "Open current version" : "Close";
            }
        }

        private async Task DownloadAndInstallAsync(Dictionary<string, object> release, bool silent)
        {
            object[] assets = release["assets"] as object[];
            Dictionary<string, object> installer = null;
            Dictionary<string, object> checksums = null;
            if (assets != null)
            {
                foreach (object value in assets)
                {
                    Dictionary<string, object> asset = value as Dictionary<string, object>;
                    if (asset == null) continue;
                    string name = Convert.ToString(asset["name"]);
                    if (name == InstallerName) installer = asset;
                    if (name == "SHA256SUMS.txt") checksums = asset;
                }
            }
            if (installer == null || checksums == null)
                throw new InvalidOperationException("The latest release is still being prepared. Try again shortly.");

            SetStatus("Verifying release files…");
            string checksumText = await Http.GetStringAsync(Convert.ToString(checksums["browser_download_url"]));
            Match match = Regex.Match(checksumText, @"(?im)^([0-9a-f]{64})\s+\*?" + Regex.Escape(InstallerName) + @"\s*$");
            if (!match.Success) throw new InvalidOperationException("The release checksum is missing the installer hash.");

            string folder = Path.Combine(Path.GetTempPath(), "Artificiai-Launcher-Update");
            Directory.CreateDirectory(folder);
            string installerPath = Path.Combine(folder, InstallerName);
            long size = Convert.ToInt64(installer["size"]);
            await DownloadFileAsync(Convert.ToString(installer["browser_download_url"]), installerPath, size);

            SetStatus("Checking the downloaded installer…");
            byte[] actual;
            using (FileStream stream = File.OpenRead(installerPath))
            using (SHA256 sha = SHA256.Create()) actual = sha.ComputeHash(stream);
            if (!FixedTimeEquals(actual, FromHex(match.Groups[1].Value)))
                throw new InvalidOperationException("The installer checksum did not match. It was not opened.");

            if (silent) CloseRunningLauncher();
            SetStatus(silent ? "Installing the update…" : "Starting setup…");
            Process installerProcess = Process.Start(new ProcessStartInfo(installerPath)
            {
                Arguments = silent ? "/S" : "",
                UseShellExecute = true
            });
            if (installerProcess == null) throw new InvalidOperationException("Windows could not start the setup program.");
            await Task.Run(delegate { installerProcess.WaitForExit(); });
            if (silent && installerProcess.ExitCode != 0)
                throw new InvalidOperationException("Setup did not complete successfully (exit code " + installerProcess.ExitCode + ").");
        }

        private async Task DownloadFileAsync(string url, string destination, long totalBytes)
        {
            using (HttpResponseMessage response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                using (Stream input = await response.Content.ReadAsStreamAsync())
                using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
                {
                    progress.Style = ProgressBarStyle.Continuous;
                    progress.Minimum = 0;
                    progress.Maximum = 1000;
                    byte[] buffer = new byte[81920];
                    long received = 0;
                    int read;
                    while ((read = await input.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    {
                        await output.WriteAsync(buffer, 0, read);
                        received += read;
                        if (totalBytes > 0)
                        {
                            progress.Value = (int)Math.Max(0, Math.Min(1000, received * 1000 / totalBytes));
                            SetStatus(String.Format("Downloading update… {0:0.0} / {1:0.0} MB", received / 1048576.0, totalBytes / 1048576.0));
                        }
                    }
                }
            }
        }

        private async Task<Dictionary<string, object>> GetLatestReleaseAsync()
        {
            string url = "https://api.github.com/repos/" + Repository + "/releases/latest";
            using (HttpResponseMessage response = await Http.GetAsync(url))
            {
                if (response.StatusCode == HttpStatusCode.NotFound)
                    throw new InvalidOperationException("No published launcher release was found.");
                response.EnsureSuccessStatusCode();
                return json.Deserialize<Dictionary<string, object>>(await response.Content.ReadAsStringAsync());
            }
        }

        private static string FindInstalledLauncher()
        {
            string exeName = "Artificiai Launcher.exe";
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = {
                Path.Combine(local, "Programs", "Artificiai Launcher", exeName),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Artificiai Launcher", exeName),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Artificiai Launcher", exeName)
            };
            foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;

            RegistryView[] views = { RegistryView.Registry64, RegistryView.Registry32 };
            RegistryHive[] hives = { RegistryHive.CurrentUser, RegistryHive.LocalMachine };
            foreach (RegistryHive hive in hives)
            foreach (RegistryView view in views)
            {
                try
                {
                    using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
                    using (RegistryKey uninstall = baseKey.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall"))
                    {
                        if (uninstall == null) continue;
                        foreach (string subName in uninstall.GetSubKeyNames())
                        using (RegistryKey app = uninstall.OpenSubKey(subName))
                        {
                            if (app == null) continue;
                            string display = Convert.ToString(app.GetValue("DisplayName"));
                            if (display.IndexOf("Artificiai Launcher", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            string icon = Convert.ToString(app.GetValue("DisplayIcon"));
                            if (!String.IsNullOrEmpty(icon))
                            {
                                int comma = icon.LastIndexOf(',');
                                if (comma > 0) icon = icon.Substring(0, comma);
                                icon = icon.Trim().Trim('"');
                                if (File.Exists(icon)) return icon;
                            }
                            string location = Convert.ToString(app.GetValue("InstallLocation"));
                            if (!String.IsNullOrEmpty(location))
                            {
                                string exe = Path.Combine(location, exeName);
                                if (File.Exists(exe)) return exe;
                            }
                        }
                    }
                }
                catch { /* Continue searching the other registry view. */ }
            }
            return null;
        }

        private static Version ReadInstalledVersion(string exe)
        {
            if (String.IsNullOrEmpty(exe) || !File.Exists(exe)) return null;
            try
            {
                FileVersionInfo info = FileVersionInfo.GetVersionInfo(exe);
                return ParseVersion(info.ProductVersion) ?? ParseVersion(info.FileVersion);
            }
            catch { return null; }
        }

        private static Version ParseVersion(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) return null;
            Match match = Regex.Match(value.Trim(), @"v?(\d+\.\d+\.\d+(?:\.\d+)?)");
            Version version;
            return match.Success && Version.TryParse(match.Groups[1].Value, out version) ? version : null;
        }

        private static void CloseRunningLauncher()
        {
            foreach (Process process in Process.GetProcessesByName("Artificiai Launcher"))
            {
                try
                {
                    if (process.MainWindowHandle == IntPtr.Zero) continue;
                    if (!process.CloseMainWindow())
                        throw new InvalidOperationException("Close Artificiai Launcher before applying this update.");
                    if (!process.WaitForExit(10000))
                        throw new InvalidOperationException("Close Artificiai Launcher before applying this update.");
                }
                finally { process.Dispose(); }
            }
        }

        private static bool FixedTimeEquals(byte[] left, byte[] right)
        {
            if (left == null || right == null || left.Length != right.Length) return false;
            int diff = 0;
            for (int i = 0; i < left.Length; i++) diff |= left[i] ^ right[i];
            return diff == 0;
        }

        private static byte[] FromHex(string value)
        {
            byte[] bytes = new byte[value.Length / 2];
            for (int i = 0; i < bytes.Length; i++) bytes[i] = Convert.ToByte(value.Substring(i * 2, 2), 16);
            return bytes;
        }

        private static HttpClient CreateClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            HttpClient client = new HttpClient();
            client.Timeout = TimeSpan.FromMinutes(20);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ArtificiaiBootstrapper/1.0");
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            return client;
        }

        private void SetStatus(string message)
        {
            status.Text = message;
            status.AccessibleDescription = message;
            Application.DoEvents();
        }

    }
}
