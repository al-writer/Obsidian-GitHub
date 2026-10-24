import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, GitHubSyncSettings, GitHubSyncSettingTab } from "./settings";

export default class GitHubSyncPlugin extends Plugin {
	settings: GitHubSyncSettings;
	private syncing = false;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new GitHubSyncSettingTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => this.sync(),
		});

		this.addRibbonIcon("refresh-cw", "Sync with GitHub", () => this.sync());

		// Wait until the vault is fully loaded before the startup sync.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.syncOnStartup) {
				this.sync();
			}
		});
	}

	async sync() {
		if (this.syncing) {
			new Notice("GitHub Sync: sync is already running");
			return;
		}

		const { token, owner, repo } = this.settings;
		if (!token || !owner || !repo) {
			new Notice("GitHub Sync: configure token and repository in settings");
			return;
		}

		this.syncing = true;
		try {
			// TODO: implement pull/push of vault files via the GitHub API.
			new Notice("GitHub Sync: sync is not implemented yet");
		} catch (e) {
			console.error("GitHub Sync failed", e);
			new Notice(`GitHub Sync failed: ${e instanceof Error ? e.message : e}`);
		} finally {
			this.syncing = false;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
