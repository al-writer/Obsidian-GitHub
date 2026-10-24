import { App, PluginSettingTab, Setting } from "obsidian";
import type GitHubSyncPlugin from "./main";

export interface GitHubSyncSettings {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	syncOnStartup: boolean;
}

export const DEFAULT_SETTINGS: GitHubSyncSettings = {
	token: "",
	owner: "",
	repo: "",
	branch: "main",
	syncOnStartup: true,
};

export class GitHubSyncSettingTab extends PluginSettingTab {
	plugin: GitHubSyncPlugin;

	constructor(app: App, plugin: GitHubSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("GitHub token")
			.setDesc("Personal access token with read/write access to repository contents.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("github_pat_...")
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Repository owner")
			.addText((text) =>
				text
					.setPlaceholder("username")
					.setValue(this.plugin.settings.owner)
					.onChange(async (value) => {
						this.plugin.settings.owner = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Repository name")
			.addText((text) =>
				text
					.setPlaceholder("my-vault")
					.setValue(this.plugin.settings.repo)
					.onChange(async (value) => {
						this.plugin.settings.repo = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Branch")
			.addText((text) =>
				text
					.setPlaceholder("main")
					.setValue(this.plugin.settings.branch)
					.onChange(async (value) => {
						this.plugin.settings.branch = value.trim() || "main";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync on startup")
			.setDesc("Run a sync automatically when Obsidian starts.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
					this.plugin.settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
