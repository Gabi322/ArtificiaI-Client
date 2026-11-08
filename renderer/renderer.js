const $ = (id) => document.getElementById(id);

/** Tiny helper to build elements safely (never inserts untrusted text as HTML). */
function h(tag, props = {}, ...kids) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') el.className = v;
		else if (k === 'text') el.textContent = v;
		else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else el.setAttribute(k, v);
	}
	for (const kid of kids) if (kid) el.append(kid);
	return el;
}

const state = { profiles: [], selected: 'aic', installed: {}, running: false };

// ---------- navigation ----------
function showPage(name) {
	document.querySelectorAll('.page').forEach((p) => (p.hidden = p.id !== 'page-' + name));
	document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('active', n.dataset.page === name));
	if (name === 'mods') searchMods($('search').value);
}
document.querySelectorAll('[data-page]').forEach((n) => n.addEventListener('click', () => showPage(n.dataset.page)));
document.getElementById('viewVersions').addEventListener('click', () => showPage('versions'));
document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => window.launcher.win(b.dataset.win)));

// close dropdowns when clicking elsewhere
document.addEventListener('click', (e) => {
	if (!e.target.closest('.acct-wrap')) $('acctMenu').hidden = true;
	if (!e.target.closest('.launchwrap')) $('launchMenu').hidden = true;
});

// ---------- account ----------
let account = null;
function setAccount(acc) {
	account = acc;
	$('acctName').textContent = acc ? acc.name : 'Not logged in';
	$('acctState').textContent = acc ? 'Online' : 'Click to sign in';
	$('accountDot').classList.toggle('offline', !acc);
	$('greeting').textContent = `Hey, ${acc ? acc.name : 'player'}`;
	const img = $('acctImg');
	if (acc) {
		img.src = 'https://minotar.net/helm/' + encodeURIComponent(acc.name) + '/32';
		img.hidden = false;
	} else {
		img.hidden = true;
	}
	$('acctAction').textContent = acc ? 'Log out' : 'Log in with Microsoft';
}
$('acct').addEventListener('click', () => ($('acctMenu').hidden = !$('acctMenu').hidden));
$('acctAction').addEventListener('click', async () => {
	$('acctMenu').hidden = true;
	if (account) {
		await window.launcher.logout();
		setAccount(null);
		setStatus('Logged out');
		return;
	}
	setStatus('Opening Microsoft login...');
	const res = await window.launcher.login();
	if (res.ok) {
		setAccount({ name: res.name });
		setStatus('');
	} else {
		setStatus('Login failed: ' + res.error);
	}
});

// ---------- profiles + launch ----------
function selectedProfile() {
	return state.profiles.find((p) => p.id === state.selected) || state.profiles[0];
}
function setStatus(text) {
	$('launchSub').textContent = text || 'READY';
	$('launchSub').title = text || '';
	$('heroStatus').textContent = text ? text.toUpperCase() : 'READY TO PLAY';
	$('heroStatus').title = text || '';
	$('greetingSub').textContent = text || 'Ready to play?';
	$('greetingSub').title = text || '';
}
let javaLookupSequence = 0;
async function updateJavaPath() {
	const sequence = ++javaLookupSequence;
	const settings = await window.launcher.getSettings();
	if (sequence === javaLookupSequence) $('javaPath').textContent = settings.java;
}
async function updateHomeProfile() {
	const profile = selectedProfile();
	if (!profile) return;
	$('heroVersion').textContent = profile.mc;
	$('heroProfile').textContent = `${profile.name} · ${profile.loader}`;
	$('homeProfileMeta').textContent = `${profile.loader.toUpperCase()} · ${profile.mc}`;
	$('launchSub').textContent = state.running ? $('launchSub').textContent : 'READY';
	if (profile.loader !== 'Fabric') {
		$('homeModsCount').textContent = 'VANILLA';
		$('modsBadge').hidden = true;
		return;
	}
	const installed = await window.launcher.modsInstalled(profile.id);
	const count = Object.keys(installed || {}).length;
	$('homeModsCount').textContent = `${count} MOD${count === 1 ? '' : 'S'}`;
	$('modsBadge').textContent = count;
	$('modsBadge').hidden = count === 0;
}
function renderProfiles() {
	const box = $('profiles');
	box.replaceChildren();
	for (const p of state.profiles) {
		box.append(
			h('button', {
				class: 'profile' + (p.id === state.selected ? ' sel' : ''),
				onclick: () => {
					state.selected = p.id;
						window.launcher.setSettings({ selected: p.id }).then(updateJavaPath);
					renderProfiles();
					if (!state.running) setStatus('');
					if (!$('page-mods').hidden) searchMods($('search').value);
				}
			},
				h('div', { class: 'picon', text: p.icon }),
				h('div', { class: 'profile-copy' },
					h('div', { class: 'pname', text: p.name }),
					h('div', { class: 'pmeta', text: `${p.mc}  ·  ${p.loader}` }),
					h('div', { class: 'profile-scope', text: p.id === 'aic' ? 'Uses your existing client folder' : 'Uses a separate game folder' })
				),
				h('span', { class: 'profile-active', text: p.id === state.selected ? 'Selected' : '' })
			)
		);
	}
	if (!state.running) setStatus('');
	updateHomeProfile();
}

let releaseVersionIds = [];
async function openProfileModal() {
	$('profileError').hidden = true;
	$('profileError').textContent = '';
	$('profileName').value = '';
	$('profileVersion').value = '1.21.11';
	$('profileLoader').value = 'Vanilla';
	$('profileModal').hidden = false;
	$('profileName').focus();
	if (!releaseVersionIds.length) {
		$('profileSubmit').disabled = true;
		$('profileSubmit').textContent = 'Loading versions…';
		const res = await window.launcher.getVersions();
		releaseVersionIds = res.versions || [];
		const popular = res.popular || [];
		const ordered = [...new Set([...popular, ...releaseVersionIds])];
		$('releaseVersions').replaceChildren(...ordered.map((version) => h('option', { value: version })));
		$('profileSubmit').disabled = false;
		$('profileSubmit').textContent = 'Create profile';
	}
}
$('createProfile').addEventListener('click', openProfileModal);
$('createProfileVersions').addEventListener('click', openProfileModal);
document.querySelectorAll('[data-close-profile]').forEach((button) => button.addEventListener('click', () => { $('profileModal').hidden = true; }));
$('profileForm').addEventListener('submit', async (event) => {
	event.preventDefault();
	const submit = $('profileSubmit');
	const input = {
		name: $('profileName').value.trim(),
		mc: $('profileVersion').value.trim(),
		loader: $('profileLoader').value
	};
	$('profileError').hidden = true;
	submit.disabled = true;
	submit.textContent = 'Creating…';
	const result = await window.launcher.createProfile(input);
	submit.disabled = false;
	submit.textContent = 'Create profile';
	if (!result.ok) {
		$('profileError').textContent = result.error;
		$('profileError').hidden = false;
		return;
	}
	state.profiles.push(result.profile);
	state.selected = result.profile.id;
	await window.launcher.setSettings({ selected: state.selected });
	updateJavaPath();
	$('profileModal').hidden = true;
	renderProfiles();
	setStatus(`Created ${result.profile.name} · clean install`);
});

$('launch').addEventListener('click', async () => {
	state.running = true;
	$('launch').disabled = true;
	$('launchText').textContent = 'Starting…';
	setStatus('Starting Minecraft…');
	const res = await window.launcher.play(state.selected);
	if (!res.ok) {
		state.running = false;
		$('launch').disabled = false;
		$('launchText').textContent = 'Play';
		setStatus('Launch failed: ' + res.error);
	}
});
$('launchMore').addEventListener('click', () => ($('launchMenu').hidden = !$('launchMenu').hidden));
$('launchMenu').addEventListener('click', (e) => {
	const act = e.target.dataset.act;
	$('launchMenu').hidden = true;
	if (act === 'game') window.launcher.openFolder('game', state.selected);
	else if (act === 'mods') window.launcher.openFolder('mods', state.selected);
	else if (act === 'client') window.launcher.openFolder('client');
});

window.launcher.on('status', setStatus);
window.launcher.on('account', (acc) => setAccount(acc));
window.launcher.on('closed', (code) => {
	state.running = false;
	$('launch').disabled = false;
	$('launchText').textContent = 'Play';
	setStatus(code === 0 ? 'Game closed' : `Game closed with code ${code}`);
	setTimeout(() => !state.running && setStatus(''), 4000);
});

// ---------- mods ----------
function fmt(n) {
	if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
	if (n >= 1e3) return Math.round(n / 1e3) + 'K';
	return String(n);
}

function modButton(mod) {
	const btn = h('button', { class: 'btn' });
	const paint = () => {
		const isIn = !!state.installed[mod.id];
		btn.textContent = isIn ? 'Installed' : 'Install';
		btn.className = 'btn' + (isIn ? ' done' : '');
		btn.title = isIn ? 'Click to remove' : '';
		btn.disabled = false;
	};
	btn.addEventListener('click', async () => {
		btn.disabled = true;
		const wasIn = !!state.installed[mod.id];
		btn.textContent = wasIn ? 'Removing...' : 'Installing...';
		const profileId = state.selected;
		const res = wasIn ? await window.launcher.modsRemove(mod.id, profileId) : await window.launcher.modsInstall(mod.id, profileId);
		if (res.ok) {
			state.installed = res.installed;
			paint();
			updateHomeProfile();
		} else {
			btn.textContent = 'Failed';
			btn.title = res.error;
			setTimeout(paint, 3000);
		}
	});
	paint();
	return btn;
}

function renderMods(hits) {
	const list = $('modlist');
	list.replaceChildren();
	if (!hits.length) {
		list.append(h('div', { class: 'empty', text: `No mods found for Fabric ${selectedProfile()?.mc || ''}.` }));
		return;
	}
	for (const m of hits) {
		const icon = m.icon ? h('img', { src: m.icon, alt: '' }) : h('div', { class: 'noicon' });
		list.append(
			h('div', { class: 'mod' },
				icon,
				h('div', { class: 'minfo' },
					h('div', { class: 'mtitle' }, m.title, h('small', { text: 'by ' + m.author })),
					h('div', { class: 'mdesc', text: m.description }),
					h('div', { class: 'tags' }, ...m.tags.map((t) => h('span', { class: 'tag', text: t })))
				),
				h('div', { class: 'mside' },
					h('div', { class: 'dl', text: fmt(m.downloads) + ' downloads' }),
					modButton(m)
				)
			)
		);
	}
}

let searchTimer = null;
let searchSeq = 0;
async function searchMods(q) {
	const seq = ++searchSeq;
	const profile = selectedProfile();
	if (!profile) return;
	$('modsHeading').textContent = `Mods · ${profile.name}`;
	$('modsProfileChip').textContent = `${profile.loader.toUpperCase()} PROFILE`;
	$('modsVersionChip').textContent = `${profile.loader.toUpperCase()} · ${profile.mc}`;
	const search = $('search');
	if (profile.loader !== 'Fabric') {
		search.disabled = true;
		$('modsMessage').textContent = 'This is a Vanilla profile. Create or select a Fabric profile to browse mods.';
		$('modsMessage').hidden = false;
		$('modlist').replaceChildren();
		state.installed = {};
		return;
	}
	search.disabled = false;
	$('modsMessage').hidden = true;
	$('modlist').replaceChildren(h('div', { class: 'empty', text: 'Loading...' }));
	state.installed = await window.launcher.modsInstalled(profile.id);
	const res = await window.launcher.modsSearch(q, profile.id);
	if (seq !== searchSeq) return; // a newer search replaced this one
	if (!res.ok) {
		$('modlist').replaceChildren(h('div', { class: 'empty', text: 'Could not reach Modrinth: ' + res.error }));
		return;
	}
	renderMods(res.hits);
}
$('search').addEventListener('input', (e) => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => searchMods(e.target.value), 350);
});

// ---------- appearance ----------
let savedSettings = {};
const APPEARANCE_DEFAULTS = { accent: '#b9e77a', mainColor: '#101310', tint: '#101310', blur: 18, windowOpacity: 76, windowMaterial: 'acrylic' };
function hexRgb(hex) {
	const value = hex.replace('#', '');
	return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)).join(',');
}
function mixHex(hex, amount, towardWhite) {
	const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16));
	const target = towardWhite ? 255 : 0;
	return '#' + channels.map((n) => Math.round(n + (target - n) * amount).toString(16).padStart(2, '0')).join('');
}
function applyAppearance(settings) {
	const accent = /^#[0-9a-f]{6}$/i.test(settings.accent || '') ? settings.accent : APPEARANCE_DEFAULTS.accent;
	const mainColor = /^#[0-9a-f]{6}$/i.test(settings.mainColor || '') ? settings.mainColor : APPEARANCE_DEFAULTS.mainColor;
	const tint = /^#[0-9a-f]{6}$/i.test(settings.tint || '') ? settings.tint : APPEARANCE_DEFAULTS.tint;
	const blur = Math.max(0, Math.min(30, Number(settings.blur ?? APPEARANCE_DEFAULTS.blur)));
	const opacity = Math.max(35, Math.min(100, Number(settings.windowOpacity ?? APPEARANCE_DEFAULTS.windowOpacity)));
	const root = document.documentElement;
	const rgb = hexRgb(mainColor).split(',').map(Number);
	const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
	const towardWhite = luminance < 145;
	root.style.setProperty('--bg', mainColor);
	root.style.setProperty('--surface', mixHex(mainColor, .08, towardWhite));
	root.style.setProperty('--surface-raised', mixHex(mainColor, .14, towardWhite));
	root.style.setProperty('--surface-hover', mixHex(mainColor, .19, towardWhite));
	root.style.setProperty('--line', mixHex(mainColor, .28, towardWhite));
	root.style.setProperty('--line-soft', mixHex(mainColor, .21, towardWhite));
	root.style.setProperty('--text', luminance > 165 ? '#182015' : '#edf1e8');
	root.style.setProperty('--dim', luminance > 165 ? '#55604f' : '#9ca697');
	root.style.setProperty('--muted', luminance > 165 ? '#6b7664' : '#6e796a');
	root.style.setProperty('--accent', accent);
	root.style.setProperty('--accent-rgb', hexRgb(accent));
	root.style.setProperty('--accent-ink', '#182015');
	root.style.setProperty('--window-overlay', `rgba(${hexRgb(tint)},${opacity / 100})`);
	root.style.setProperty('--main-overlay', `rgba(${hexRgb(mainColor)},${opacity / 100})`);
	root.style.setProperty('--glass-surface', `rgba(${hexRgb(mainColor)},${Math.min(.82, opacity / 100 * .78)})`);
	root.style.setProperty('--glass-edge', `rgba(${luminance > 165 ? '20,30,20' : '230,240,225'},${Math.min(.18, .06 + (100 - opacity) / 350)})`);
	$('mainColor').value = mainColor;
	root.style.setProperty('--backdrop-blur', `${blur}px`);
	$('accentPicker').value = accent;
	$('tintColor').value = tint;
	$('blurAmount').value = blur;
	$('blurValue').textContent = `${blur} px`;
	$('windowOpacity').value = opacity;
	$('opacityValue').textContent = `${opacity}%`;
	$('material').value = ['acrylic', 'mica', 'none'].includes(settings.windowMaterial) ? settings.windowMaterial : APPEARANCE_DEFAULTS.windowMaterial;
	document.querySelectorAll('.swatch').forEach((button) => button.classList.toggle('selected', button.dataset.accent.toLowerCase() === accent.toLowerCase()));
}
function readAppearance() {
	return {
		accent: $('accentPicker').value,
		mainColor: $('mainColor').value,
		tint: $('tintColor').value,
		blur: Number($('blurAmount').value),
		windowOpacity: Number($('windowOpacity').value),
		windowMaterial: $('material').value
	};
}
async function saveAppearance() {
	const appearance = readAppearance();
	applyAppearance(appearance);
	savedSettings = await window.launcher.setSettings({ ...appearance });
}
for (const button of document.querySelectorAll('.swatch')) {
	button.addEventListener('click', async () => {
		$('accentPicker').value = button.dataset.accent;
		applyAppearance({ ...savedSettings, ...readAppearance(), accent: button.dataset.accent });
		await saveAppearance();
	});
}
$('mainColor').addEventListener('input', () => applyAppearance({ ...savedSettings, ...readAppearance() }));
$('mainColor').addEventListener('change', saveAppearance);
$('accentPicker').addEventListener('input', () => applyAppearance({ ...savedSettings, ...readAppearance() }));
$('accentPicker').addEventListener('change', saveAppearance);
$('tintColor').addEventListener('input', () => applyAppearance({ ...savedSettings, ...readAppearance() }));
$('tintColor').addEventListener('change', saveAppearance);
$('blurAmount').addEventListener('input', () => applyAppearance({ ...savedSettings, ...readAppearance() }));
$('blurAmount').addEventListener('change', saveAppearance);
$('windowOpacity').addEventListener('input', () => applyAppearance({ ...savedSettings, ...readAppearance() }));
$('windowOpacity').addEventListener('change', saveAppearance);
$('material').addEventListener('change', saveAppearance);
$('frostPreset').addEventListener('click', async () => {
	const preset = { ...readAppearance(), tint: '#171d18', blur: 20, windowOpacity: 68, windowMaterial: 'acrylic' };
	$('tintColor').value = preset.tint;
	$('blurAmount').value = preset.blur;
	$('windowOpacity').value = preset.windowOpacity;
	$('material').value = preset.windowMaterial;
	applyAppearance(preset);
	savedSettings = await window.launcher.setSettings(preset);
});
$('appearanceReset').addEventListener('click', async () => {
	Object.assign(savedSettings, APPEARANCE_DEFAULTS);
	applyAppearance(savedSettings);
	savedSettings = await window.launcher.setSettings({ ...APPEARANCE_DEFAULTS });
});
// ---------- settings ----------
$('ram').addEventListener('input', (e) => ($('ramValue').textContent = e.target.value));
$('ram').addEventListener('change', (e) => window.launcher.setSettings({ ram: Number(e.target.value) }));
document.querySelectorAll('[data-folder]').forEach((b) =>
	b.addEventListener('click', () => window.launcher.openFolder(b.dataset.folder, state.selected))
);

// ---------- start ----------
(async () => {
	state.profiles = await window.launcher.getProfiles();
	const s = await window.launcher.getSettings();
	state.selected = s.selected || 'aic';
	savedSettings = s;
applyAppearance(s);
	$('ram').value = s.ram;
	$('ramValue').textContent = s.ram;
	$('javaPath').textContent = s.java;
	setAccount(await window.launcher.getAccount());
	renderProfiles();
})();
