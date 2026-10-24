import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { GitHubClient } from "./github";
import { LANGUAGE_NAMES, LanguageSetting } from "./i18n";
import type QoimaSyncPlugin from "./main";

export interface QoimaSyncSettings {
	language: LanguageSetting;
	token: string;
	owner: string;
	repo: string;
	branch: string;
	syncOnStartup: boolean;
	syncInterval: number;
	syncOnQuit: boolean;
	showNotices: boolean;
	deletionGuard: boolean;
}

export const DEFAULT_SETTINGS: QoimaSyncSettings = {
	language: "auto",
	token: "",
	owner: "",
	repo: "",
	branch: "main",
	syncOnStartup: true,
	syncInterval: 0,
	syncOnQuit: true,
	showNotices: true,
	deletionGuard: true,
};

export class QoimaSyncSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: QoimaSyncPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;
		const t = this.plugin.t;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t("settingLanguage"))
			.setDesc(t("settingLanguageDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", t("settingLanguageAuto"))
					.addOptions(LANGUAGE_NAMES)
					.setValue(settings.language)
					.onChange(async (value) => {
						settings.language = value as LanguageSetting;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName(t("settingToken"))
			.setDesc(t("settingTokenDesc"))
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("github_pat_...")
					.setValue(settings.token)
					.onChange(async (value) => {
						settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settingOwner"))
			.setDesc(t("settingOwnerDesc"))
			.addText((text) =>
				text
					.setPlaceholder("username")
					.setValue(settings.owner)
					.onChange(async (value) => {
						settings.owner = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName(t("settingRepo")).addText((text) =>
			text
				.setPlaceholder("my-vault")
				.setValue(settings.repo)
				.onChange(async (value) => {
					settings.repo = value.trim();
					await this.plugin.saveSettings();
				})
		);

		const branchList = containerEl.createEl("datalist", { attr: { id: "qoima-sync-branches" } });
		new Setting(containerEl)
			.setName(t("settingBranch"))
			.setDesc(t("settingBranchDesc"))
			.addText((text) => {
				text.inputEl.setAttribute("list", branchList.id);
				text
					.setPlaceholder("main")
					.setValue(settings.branch)
					.onChange(async (value) => {
						settings.branch = value.trim() || DEFAULT_SETTINGS.branch;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) =>
				button
					.setIcon("refresh-cw")
					.setTooltip(t("settingLoadBranches"))
					.onClick(async () => {
						if (!settings.token || !settings.owner || !settings.repo) {
							new Notice(t("noticeNotConfigured"));
							return;
						}
						try {
							const client = new GitHubClient(settings.token, settings.owner, settings.repo);
							const branches = await client.listBranches();
							branchList.empty();
							for (const name of branches) branchList.createEl("option", { value: name });
							new Notice(t("noticeBranchesLoaded", { n: branches.length }));
						} catch (e) {
							new Notice(t("noticeError", { message: this.plugin.describeError(e) }));
						}
					})
			);

		new Setting(containerEl)
			.setName(t("settingSyncOnStartup"))
			.setDesc(t("settingSyncOnStartupDesc"))
			.addToggle((toggle) =>
				toggle.setValue(settings.syncOnStartup).onChange(async (value) => {
					settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(t("settingSyncOnQuit"))
			.setDesc(t("settingSyncOnQuitDesc"))
			.addToggle((toggle) =>
				toggle.setValue(settings.syncOnQuit).onChange(async (value) => {
					settings.syncOnQuit = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(t("settingSyncInterval"))
			.setDesc(t("settingSyncIntervalDesc"))
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text
					.setPlaceholder("0")
					.setValue(String(settings.syncInterval))
					.onChange(async (value) => {
						const minutes = Number.parseInt(value, 10);
						settings.syncInterval = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
						await this.plugin.saveSettings();
						this.plugin.scheduleSync();
					});
			});

		new Setting(containerEl)
			.setName(t("settingNotices"))
			.setDesc(t("settingNoticesDesc"))
			.addToggle((toggle) =>
				toggle.setValue(settings.showNotices).onChange(async (value) => {
					settings.showNotices = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(t("settingDeletionGuard"))
			.setDesc(t("settingDeletionGuardDesc"))
			.addToggle((toggle) =>
				toggle.setValue(settings.deletionGuard).onChange(async (value) => {
					settings.deletionGuard = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
