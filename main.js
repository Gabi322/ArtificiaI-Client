const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

const MC_VERSION = '1.21.11';
const UA = 'artificiai-client/0.3.0 (launcher)';
const POPULAR_VERSIONS = [
	'1.21.11', '1.21.10', '1.21.8', '1.21.5', '1.21.4', '1.21.1',
	'1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2',
	'1.16.5', '1.14.4', '1.13.1', '1.12.2', '1.8.9', '1.7.10'
];
const DEFAULT_PROFILES = [
	{ id: 'aic', name: 'ArtificiaI Client', mc: MC_VERSION, loader: 'Fabric', icon: 'A', builtIn: true },
	{ id: 'vanilla', name: 'Vanilla', mc: MC_VERSION, loader: 'Vanilla', icon: 'V', builtIn: true }
];

let win = null;
let account = null;
let running = false;
let releaseVersionCache = null;
let javaMajorByVersion = {};

const dataDir = () => app.getPath('userData');
const gameDir = () => path.join(dataDir(), 'game'); // legacy AIC directory; preserves existing worlds and mods
const settingsFile = () => path.join(dataDir(), 'settings.json');
const profilesFile = () => path.join(dataDir(), 'profiles.json');
const versionsCacheFile = () => path.join(dataDir(), 'versions-cache.json');
const modsStateFile = () => path.join(dataDir(), 'mods.json');
const clientStateFile = () => path.join(dataDir(), 'client.json');
const clientDir = () => path.join(__dirname, 'client');
const instancesDir = () => path.join(dataDir(), 'profiles');

function readJson(file, fallback) {
	try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
	catch { return fallback; }
}
function writeJson(file, data) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const SETTINGS_DEFAULTS = {
	ram: 4, selected: 'aic', accent: '#b9e77a', mainColor: '#101310', tint: '#101310',
	blur: 18, windowOpacity: 76, windowMaterial: 'acrylic'
};
const loadSettings = () => readJson(settingsFile(), SETTINGS_DEFAULTS);

function loadProfiles() {
	const stored = readJson(profilesFile(), { profiles: [] }).profiles;
	const custom = Array.isArray(stored) ? stored.filter((p) =>
		p && typeof p.id === 'string' && /^profile-[a-f0-9-]{36}$/i.test(p.id) &&
		typeof p.name === 'string' && typeof p.mc === 'string' &&
		['Vanilla', 'Fabric'].includes(p.loader)
	) : [];
	return [...DEFAULT_PROFILES, ...custom];
}
function findProfile(profileId) {
	return loadProfiles().find((p) => p.id === profileId) || DEFAULT_PROFILES[0];
}
function profileRoot(profile) {
	if (profile.id === 'aic') return gameDir();
	return path.join(instancesDir(), profile.id);
}
function profileModsDir(profile) { return path.join(profileRoot(profile), 'mods'); }
function profileModsStateFile(profile) {
	return profile.id === 'aic' ? modsStateFile() : path.join(profileRoot(profile), '.artificiai-mods.json');
}

function send(channel, payload) {
	if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
	win = new BrowserWindow({
		width: 1100, height: 700, minWidth: 760, minHeight: 500,
		frame: false, backgroundColor: '#101310', transparent: false,
		resizable: true, maximizable: true,
		icon: path.join(__dirname, 'assets', 'artificiai.ico'),
		title: 'ArtificiaI Client',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	win.setResizable(true);
	win.setMinimumSize(760, 500);
	win.setMenuBarVisibility(false);
	applyWindowMaterial(loadSettings().windowMaterial);
	win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function findJava(mcVersion) {
	const [major = 0, minor = 0, patch = 0] = String(mcVersion || MC_VERSION).split('.').map(Number);
	const required = javaMajorByVersion[mcVersion] || (major > 1 || minor > 20 || (minor === 20 && patch >= 5) ? 21 : minor >= 18 ? 17 : minor >= 17 ? 16 : 8);
	const bases = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft', 'C:\\Program Files\\Java', 'C:\\Program Files (x86)\\Java'];
	for (const base of bases) {
		try {
			for (const name of fs.readdirSync(base)) {
				if (new RegExp(`(?:jdk|jre)[-_]?${required}(?:\\D|$)`, 'i').test(name)) {
					const exe = path.join(base, name, 'bin', 'java.exe');
					if (fs.existsSync(exe)) return exe;
				}
			}
		} catch { /* folder missing, try the next */ }
	}
	return 'java';
}

async function getJson(url) {
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
	return res.json();
}

async function getReleaseVersions() {
	if (releaseVersionCache) return releaseVersionCache;
	const cachedData = readJson(versionsCacheFile(), { versions: [], javaMajorByVersion: {} });
	const cached = cachedData.versions;
	javaMajorByVersion = cachedData.javaMajorByVersion || {};
	try {
		const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
		const entries = (manifest.versions || []).filter((v) => v.type === 'release');
		const versions = entries.map((v) => v.id);
		if (!versions.length) throw new Error('Minecraft version list was empty');
		javaMajorByVersion = Object.fromEntries(entries.filter((v) => v.javaVersion?.majorVersion).map((v) => [v.id, v.javaVersion.majorVersion]));
		writeJson(versionsCacheFile(), { versions, javaMajorByVersion, fetchedAt: Date.now() });
		releaseVersionCache = versions;
		return versions;
	} catch (err) {
		releaseVersionCache = Array.isArray(cached) && cached.length ? cached : [...POPULAR_VERSIONS];
		return releaseVersionCache;
	}
}

async function ensureFabric(mcVersion, root) {
	const versionsDir = path.join(root, 'versions');
	try {
		const list = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
		const pick = list.find((l) => l.loader && l.loader.stable) || list[0];
		if (!pick) throw new Error(`Fabric does not list support for Minecraft ${mcVersion}`);
		const profile = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${pick.loader.version}/profile/json`);
		const dir = path.join(versionsDir, profile.id);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
		return profile.id;
	} catch (err) {
		try {
			const existing = fs.readdirSync(versionsDir).find((n) => n.startsWith('fabric-loader-') && n.endsWith(mcVersion));
			if (existing) return existing;
		} catch { /* no existing loader */ }
		throw new Error(`Could not prepare Fabric ${mcVersion}: ${err.message}`);
	}
}

function syncClientJars(profile) {
	const modsDir = profileModsDir(profile);
	fs.mkdirSync(clientDir(), { recursive: true });
	fs.mkdirSync(modsDir, { recursive: true });
	const state = readJson(clientStateFile(), { files: [] });
	for (const file of state.files || []) {
		try { fs.unlinkSync(path.join(modsDir, file)); } catch { /* already absent */ }
	}
	const jars = fs.readdirSync(clientDir()).filter((n) =>
		n.endsWith('.jar') && !n.endsWith('-sources.jar') && !n.endsWith('-dev.jar')
	);
	for (const jar of jars) fs.copyFileSync(path.join(clientDir(), jar), path.join(modsDir, jar));
	writeJson(clientStateFile(), { files: jars });
	return jars.length;
}

async function ensureFabricApi(mcVersion, root) {
	const modsDir = path.join(root, 'mods');
	fs.mkdirSync(modsDir, { recursive: true });
	const markerFile = path.join(root, '.artificiai-fabric-api.json');
	const managed = readJson(markerFile, { file: null });
	const existing = fs.readdirSync(modsDir).find((name) => /^fabric-api.*\.jar$/i.test(name));
	if (managed.file && managed.mc === mcVersion && existing === managed.file) return existing;
	if (!managed.file && existing) {
		writeJson(markerFile, { file: existing, mc: mcVersion });
		return existing;
	}
	if (managed.file && managed.mc !== mcVersion) {
		try { fs.unlinkSync(path.join(modsDir, managed.file)); } catch { /* old managed file is already gone */ }
	}
	const versions = await getJson(`https://api.modrinth.com/v2/project/P7dR8mSH/version?loaders=${enc('["fabric"]')}&game_versions=${enc(JSON.stringify([mcVersion]))}&include_changelog=false`);
	const version = versions.find((entry) => entry.version_type === 'release') || versions[0];
	if (!version) throw new Error(`Fabric API does not list support for Minecraft ${mcVersion}.`);
	const file = version.files.find((entry) => entry.primary) || version.files[0];
	if (!file?.url || !file.filename) throw new Error(`Could not find the Fabric API download for Minecraft ${mcVersion}.`);
	if (managed.file && managed.file !== file.filename) {
		try { fs.unlinkSync(path.join(modsDir, managed.file)); } catch { /* old managed file is already gone */ }
	}
	if (existing && existing !== managed.file) {
		writeJson(markerFile, { file: existing, mc: mcVersion });
		return existing;
	}
	const target = path.join(modsDir, file.filename);
	if (!fs.existsSync(target)) {
		const response = await fetch(file.url, { headers: { 'User-Agent': UA } });
		if (!response.ok) throw new Error(`Fabric API download failed (${response.status}).`);
		fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
	}
	writeJson(markerFile, { file: file.filename, mc: mcVersion });
	return file.filename;
}

async function login() {
	const authManager = new Auth('select_account');
	const xbox = await authManager.launch('electron');
	account = await xbox.getMinecraft();
	return { name: account.mclc().name };
}

function applyWindowMaterial(material) {
	if (!win || win.isDestroyed()) return;
	const choice = ['acrylic', 'mica', 'none'].includes(material) ? material : 'acrylic';
	if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') win.setBackgroundMaterial(choice);
	else if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
		win.setVibrancy(choice === 'none' ? null : (choice === 'acrylic' ? 'under-window' : 'window'));
	}
}

ipcMain.handle('win', (_e, cmd) => {
	if (!win) return;
	if (cmd === 'min') win.minimize();
	else if (cmd === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
	else if (cmd === 'close') win.close();
});

ipcMain.handle('login', async () => {
	try { return { ok: true, ...(await login()) }; }
	catch (err) { return { ok: false, error: String(err?.message || err) }; }
});
ipcMain.handle('logout', () => { account = null; });
ipcMain.handle('account:get', () => (account ? { name: account.mclc().name } : null));

ipcMain.handle('profiles:get', () => loadProfiles());
ipcMain.handle('versions:get', async () => {
	try { return { ok: true, versions: await getReleaseVersions(), popular: POPULAR_VERSIONS }; }
	catch (err) { return { ok: false, error: String(err.message || err), versions: POPULAR_VERSIONS, popular: POPULAR_VERSIONS }; }
});
ipcMain.handle('profiles:create', async (_e, input) => {
	try {
		const name = String(input?.name || '').trim().slice(0, 32);
		const mc = String(input?.mc || '').trim();
		const loader = input?.loader === 'Fabric' ? 'Fabric' : 'Vanilla';
		if (!name) throw new Error('Enter a name for this profile.');
		if (loadProfiles().some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error('A profile with that name already exists.');
		const versions = await getReleaseVersions();
		if (!versions.includes(mc)) throw new Error('Choose a released Minecraft version from the list.');
		const profile = { id: `profile-${crypto.randomUUID()}`, name, mc, loader, icon: name[0].toUpperCase() };
		const stored = readJson(profilesFile(), { profiles: [] });
		stored.profiles = Array.isArray(stored.profiles) ? stored.profiles : [];
		stored.profiles.push(profile);
		writeJson(profilesFile(), stored);
		fs.mkdirSync(profileRoot(profile), { recursive: true });
		if (loader === 'Fabric') fs.mkdirSync(profileModsDir(profile), { recursive: true });
		return { ok: true, profile };
	} catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('settings:get', () => {
	const settings = loadSettings();
	return { ...settings, java: findJava(findProfile(settings.selected).mc) };
});
ipcMain.handle('settings:set', (_e, s) => {
	const incoming = s && typeof s === 'object' ? s : {};
	const merged = { ...loadSettings(), ...incoming };
	if (!loadProfiles().some((p) => p.id === merged.selected)) merged.selected = 'aic';
	if (!/^#[0-9a-f]{6}$/i.test(merged.accent)) merged.accent = SETTINGS_DEFAULTS.accent;
	if (!/^#[0-9a-f]{6}$/i.test(merged.mainColor)) merged.mainColor = SETTINGS_DEFAULTS.mainColor;
	if (!/^#[0-9a-f]{6}$/i.test(merged.tint)) merged.tint = SETTINGS_DEFAULTS.tint;
	merged.blur = Math.max(0, Math.min(30, Number(merged.blur) || 0));
	merged.windowOpacity = Math.max(35, Math.min(100, Number(merged.windowOpacity) || 76));
	if (!['acrylic', 'mica', 'none'].includes(merged.windowMaterial)) merged.windowMaterial = SETTINGS_DEFAULTS.windowMaterial;
	writeJson(settingsFile(), merged);
	applyWindowMaterial(merged.windowMaterial);
	return merged;
});
ipcMain.handle('open-folder', (_e, which, profileId) => {
	const profile = findProfile(profileId);
	const root = profileRoot(profile);
	const dir = which === 'mods' ? profileModsDir(profile) : which === 'client' ? clientDir() : root;
	fs.mkdirSync(dir, { recursive: true });
	shell.openPath(dir);
});

const enc = encodeURIComponent;
ipcMain.handle('mods:installed', (_e, profileId) => {
	const profile = findProfile(profileId);
	return readJson(profileModsStateFile(profile), {});
});
ipcMain.handle('mods:search', async (_e, { query = '', profileId } = {}) => {
	const profile = findProfile(profileId);
	if (profile.loader !== 'Fabric') return { ok: false, error: 'Mods need a Fabric profile. Select or create one in Versions.' };
	try {
		const facets = JSON.stringify([['project_type:mod'], ['categories:fabric'], [`versions:${profile.mc}`]]);
		const index = query && query.trim() ? 'relevance' : 'downloads';
		const url = `https://api.modrinth.com/v2/search?query=${enc(query || '')}&facets=${enc(facets)}&index=${index}&limit=30`;
		const data = await getJson(url);
		return { ok: true, hits: data.hits.map((h) => ({
			id: h.project_id, title: h.title, author: h.author, description: h.description,
			icon: h.icon_url, downloads: h.downloads,
			tags: (h.display_categories || h.categories || []).filter((c) => c !== 'fabric').slice(0, 3)
		})) };
	} catch (err) { return { ok: false, error: String(err.message || err) }; }
});

async function installProject(projectId, profile, state, seen) {
	if (seen.has(projectId) || state[projectId]) return;
	seen.add(projectId);
	const url = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${enc('["fabric"]')}&game_versions=${enc(JSON.stringify([profile.mc]))}`;
	const versions = await getJson(url);
	if (!versions.length) throw new Error(`No Fabric ${profile.mc} version is available for this mod.`);
	const version = versions.find((v) => v.version_type === 'release') || versions[0];
	for (const dep of version.dependencies || []) {
		if (dep.dependency_type === 'required' && dep.project_id) await installProject(dep.project_id, profile, state, seen);
	}
	const file = version.files.find((f) => f.primary) || version.files[0];
	const res = await fetch(file.url, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`Download failed (${res.status})`);
	fs.mkdirSync(profileModsDir(profile), { recursive: true });
	fs.writeFileSync(path.join(profileModsDir(profile), file.filename), Buffer.from(await res.arrayBuffer()));
	state[projectId] = file.filename;
}
ipcMain.handle('mods:install', async (_e, { projectId, profileId } = {}) => {
	const profile = findProfile(profileId);
	if (profile.loader !== 'Fabric') return { ok: false, error: 'Mods can only be added to Fabric profiles.' };
	try {
		const state = readJson(profileModsStateFile(profile), {});
		await installProject(projectId, profile, state, new Set());
		writeJson(profileModsStateFile(profile), state);
		return { ok: true, installed: state };
	} catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle('mods:remove', (_e, { projectId, profileId } = {}) => {
	const profile = findProfile(profileId);
	const state = readJson(profileModsStateFile(profile), {});
	const file = state[projectId];
	if (file) {
		try { fs.unlinkSync(path.join(profileModsDir(profile), file)); } catch { /* already absent */ }
		delete state[projectId];
		writeJson(profileModsStateFile(profile), state);
	}
	return { ok: true, installed: state };
});

ipcMain.handle('play', async (_e, profileId) => {
	if (running) return { ok: false, error: 'Minecraft is already running.' };
	const profile = findProfile(profileId);
	running = true;
	try {
		if (!account) {
			send('status', 'Signing in…');
			const res = await login();
			send('account', res);
		}
		const root = profileRoot(profile);
		fs.mkdirSync(root, { recursive: true });
		const version = { number: profile.mc, type: 'release' };
		if (profile.loader === 'Fabric') {
			send('status', `Preparing Fabric ${profile.mc}…`);
			version.custom = await ensureFabric(profile.mc, root);
			if (profile.id === 'aic') {
				syncClientJars(profile);
				send('status', `Installing Fabric API ${profile.mc}…`);
				await ensureFabricApi(profile.mc, root);
			} else {
				fs.mkdirSync(profileModsDir(profile), { recursive: true });
			}
		}
		const settings = loadSettings();
		const launcher = new Client();
		launcher.on('progress', (e) => send('status', `Downloading ${e.type} ${e.task}/${e.total}`));
		launcher.on('close', (code) => { running = false; send('closed', code); });
		send('status', `Starting ${profile.name}…`);
		const proc = await launcher.launch({
			authorization: account.mclc(), root, javaPath: findJava(profile.mc), version,
			memory: { max: `${settings.ram}G`, min: '2G' }
		});
		if (!proc) throw new Error('Minecraft did not start. Open the game log for details.');
		send('status', `Playing ${profile.name}`);
		return { ok: true };
	} catch (err) {
		running = false;
		return { ok: false, error: String(err?.message || err) };
	}
});

app.whenReady().then(() => {
	createWindow();
	if (app.isPackaged) {
		autoUpdater.autoDownload = true;
		autoUpdater.autoInstallOnAppQuit = true;
		autoUpdater.on('error', (err) => console.warn('Launcher update check failed:', err));
		autoUpdater.on('update-downloaded', async (info) => {
			const result = await dialog.showMessageBox(win, {
				type: 'info',
				title: 'ArtificiaI update ready',
				message: `Version ${info.version} is ready to install.`,
				detail: 'Restart the launcher now to finish updating, or choose Later to install when you next close it.',
				buttons: ['Restart now', 'Later'],
				defaultId: 0,
				cancelId: 1
			});
			if (result.response === 0) autoUpdater.quitAndInstall();
		});
		setTimeout(() => autoUpdater.checkForUpdates().catch((err) => console.warn('Launcher update check failed:', err)), 5000);
	}
});
app.on('window-all-closed', () => app.quit());
