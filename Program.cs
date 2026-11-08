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

namespace Artificiai.Downloader
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new DownloaderWindow());
        }
    }

    internal sealed class DownloaderWindow : Form
    {
        private const string InstallerName = "Artificiai-Launcher-Setup.exe";
        private static readonly HttpClient Http = CreateClient();
        private readonly TextBox repository = new TextBox();
        private readonly Label status = new Label();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly Button install = new Button();
        private readonly LinkLabel releaseLink = new LinkLabel();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();

        public DownloaderWindow()
        {
            Text = "Artificiai Launcher Downloader";
            ClientSize = new Size(460, 310);
            MinimumSize = new Size(476, 349);
            MaximumSize = new Size(476, 349);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(18, 22, 19);
            ForeColor = Color.FromArgb(238, 242, 234);
            Font = new Font("Segoe UI", 10F);

            Label title = new Label();
            title.Text = "Artificiai Launcher";
            title.Font = new Font("Segoe UI", 19F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(28, 24);
            title.ForeColor = Color.FromArgb(238, 242, 234);

            Label description = new Label();
            description.Text = "Get the latest launcher from a public GitHub repository.";
            description.AutoSize = true;
            description.Location = new Point(30, 66);
            description.ForeColor = Color.FromArgb(158, 170, 154);

            Label repoLabel = new Label();
            repoLabel.Text = "GitHub owner / repository";
            repoLabel.AutoSize = true;
            repoLabel.Location = new Point(30, 104);
            repoLabel.ForeColor = Color.FromArgb(204, 214, 198);

            repository.SetBounds(30, 126, 400, 31);
            repository.Text = LoadRepository();
            repository.BackColor = Color.FromArgb(29, 35, 30);
            repository.ForeColor = Color.FromArgb(238, 242, 234);
            repository.BorderStyle = BorderStyle.FixedSingle;
            repository.TextChanged += delegate
            {
                install.Enabled = IsValidRepository(repository.Text);
                SetStatus(install.Enabled ? "Ready when you are." : "Enter a GitHub owner/repository.");
            };

            progress.SetBounds(30, 170, 400, 8);
            progress.Style = ProgressBarStyle.Continuous;
            progress.ForeColor = Color.FromArgb(181, 231, 122);
            progress.Visible = false;

            status.SetBounds(30, 184, 400, 34);
            status.Text = IsValidRepository(repository.Text) ? "Ready when you are." : "Create a public GitHub repository first.";
            status.ForeColor = Color.FromArgb(158, 170, 154);
            status.AutoEllipsis = true;

            install.SetBounds(30, 230, 172, 42);
            install.Text = "Download & install";
            install.FlatStyle = FlatStyle.Flat;
            install.FlatAppearance.BorderSize = 0;
            install.BackColor = Color.FromArgb(185, 231, 122);
            install.ForeColor = Color.FromArgb(24, 32, 21);
            install.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            install.Cursor = Cursors.Hand;
            install.Enabled = IsValidRepository(repository.Text);
            install.Click += async delegate { await DownloadAndInstallAsync(); };

            releaseLink.SetBounds(284, 243, 146, 22);
            releaseLink.Text = "View release page";
            releaseLink.LinkColor = Color.FromArgb(185, 231, 122);
            releaseLink.ActiveLinkColor = Color.FromArgb(213, 246, 168);
            releaseLink.LinkClicked += delegate { OpenReleasePage(); };

            Controls.AddRange(new Control[] { title, description, repoLabel, repository, progress, status, install, releaseLink });
        }

        private async Task DownloadAndInstallAsync()
        {
            string repo = repository.Text.Trim();
            if (!IsValidRepository(repo))
            {
                SetStatus("Enter a valid GitHub owner/repository.");
                return;
            }

            SaveRepository(repo);
            install.Enabled = false;
            repository.Enabled = false;
            progress.Visible = true;
            progress.Style = ProgressBarStyle.Marquee;
            SetStatus("Checking the latest release...");

            try
            {
                string apiUrl = "https://api.github.com/repos/" + repo + "/releases/latest";
                using (HttpResponseMessage response = await Http.GetAsync(apiUrl))
                {
                    if (response.StatusCode == HttpStatusCode.NotFound)
                        throw new InvalidOperationException("No published launcher release was found yet.");
                    response.EnsureSuccessStatusCode();

                    string releaseText = await response.Content.ReadAsStringAsync();
                    Dictionary<string, object> release = json.Deserialize<Dictionary<string, object>>(releaseText);
                    object[] assets = (object[])release["assets"];
                    Dictionary<string, object> installerAsset = null;
                    Dictionary<string, object> checksumAsset = null;
                    foreach (object value in assets)
                    {
                        Dictionary<string, object> asset = (Dictionary<string, object>)value;
                        string name = Convert.ToString(asset["name"]);
                        if (name == InstallerName) installerAsset = asset;
                        if (name == "SHA256SUMS.txt") checksumAsset = asset;
                    }
                    if (installerAsset == null || checksumAsset == null)
                        throw new InvalidOperationException("The latest release is still being prepared. Try again in a minute.");

                    SetStatus("Verifying the installer...");
                    string checksumUrl = Convert.ToString(checksumAsset["browser_download_url"]);
                    string checksums = await Http.GetStringAsync(checksumUrl);
                    Match match = Regex.Match(checksums, @"(?im)^([0-9a-f]{64})\s+\*?" + Regex.Escape(InstallerName) + @"\s*$");
                    if (!match.Success)
                        throw new InvalidOperationException("The release checksum file is missing the installer hash.");

                    string folder = Path.Combine(Path.GetTempPath(), "Artificiai-Launcher-Install");
                    Directory.CreateDirectory(folder);
                    string installerPath = Path.Combine(folder, InstallerName);
                    string downloadUrl = Convert.ToString(installerAsset["browser_download_url"]);
                    long totalBytes = Convert.ToInt64(installerAsset["size"]);
                    await DownloadFileAsync(downloadUrl, installerPath, totalBytes);

                    SetStatus("Checking the downloaded file...");
                    byte[] actual;
                    using (FileStream stream = File.OpenRead(installerPath))
                    using (SHA256 sha = SHA256.Create()) actual = sha.ComputeHash(stream);
                    byte[] expected = FromHex(match.Groups[1].Value);
                    if (!FixedTimeEquals(actual, expected))
                        throw new InvalidOperationException("The installer checksum did not match. The file was not opened.");

                    SetStatus("Starting the installer...");
                    Process.Start(new ProcessStartInfo(installerPath) { UseShellExecute = true });
                    SetStatus("Installer started. Follow its steps to finish setup.");
                    progress.Visible = false;
                }
            }
            catch (Exception ex)
            {
                SetStatus(ex.Message);
                progress.Visible = false;
            }
            finally
            {
                install.Enabled = IsValidRepository(repository.Text);
                repository.Enabled = true;
            }
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
                            SetStatus(String.Format("Downloading installer… {0:0.0} / {1:0.0} MB", received / 1048576.0, totalBytes / 1048576.0));
                        }
                    }
                }
            }
        }

        private void OpenReleasePage()
        {
            string repo = repository.Text.Trim();
            if (IsValidRepository(repo))
                Process.Start(new ProcessStartInfo("https://github.com/" + repo + "/releases/latest") { UseShellExecute = true });
        }

        private static bool IsValidRepository(string value)
        {
            return Regex.IsMatch((value ?? "").Trim(), @"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$");
        }

        private static string SettingsPath
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Artificiai", "downloader.json"); }
        }

        private string LoadRepository()
        {
            try
            {
                Dictionary<string, object> settings = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(SettingsPath));
                return Convert.ToString(settings["repository"]);
            }
            catch { return ""; }
        }

        private void SaveRepository(string value)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath));
                File.WriteAllText(SettingsPath, json.Serialize(new { repository = value }));
            }
            catch { /* A missing preference file should not block downloading. */ }
        }

        private void SetStatus(string message)
        {
            status.Text = message;
            status.AccessibleDescription = message;
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
            client.Timeout = TimeSpan.FromMinutes(10);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ArtificiaiDownloader/1.0");
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            return client;
        }
    }
}
