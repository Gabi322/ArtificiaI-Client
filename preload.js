const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
	win: (cmd) => ipcRenderer.invoke('win', cmd),
	login: () => ipcRenderer.invoke('login'),
	logout: () => ipcRenderer.invoke('logout'),
	getAccount: () => ipcRenderer.invoke('account:get'),
	getProfiles: () => ipcRenderer.invoke('profiles:get'),
	getVersions: () => ipcRenderer.invoke('versions:get'),
	createProfile: (profile) => ipcRenderer.invoke('profiles:create', profile),
	getSettings: () => ipcRenderer.invoke('settings:get'),
	setSettings: (s) => ipcRenderer.invoke('settings:set', s),
	openFolder: (which, profileId) => ipcRenderer.invoke('open-folder', which, profileId),
	play: (profileId) => ipcRenderer.invoke('play', profileId),
	modsSearch: (query, profileId) => ipcRenderer.invoke('mods:search', { query, profileId }),
	modsInstalled: (profileId) => ipcRenderer.invoke('mods:installed', profileId),
	modsInstall: (projectId, profileId) => ipcRenderer.invoke('mods:install', { projectId, profileId }),
	modsRemove: (projectId, profileId) => ipcRenderer.invoke('mods:remove', { projectId, profileId }),
	on: (channel, cb) => {
		const allowed = ['status', 'log', 'closed', 'account'];
		if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
	}
});
