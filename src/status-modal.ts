import { Modal, Notice, Setting, setIcon } from "obsidian";
import type QoimaSyncPlugin from "./main";

/** Everything the status bar has no room for: the repository, the last sync, conflicts and errors. */
export class StatusModal extends Modal {
	constructor(private plugin: QoimaSyncPlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.setTitle("Qoima Sync");
		this.render();
	}

	/** Called by the plugin on every status change while the window is open. */
	render() {
		const { contentEl, plugin } = this;
		const { t, status, lastSync, settings } = plugin;
		contentEl.empty();

		const { text, icon } = plugin.statusLabel();
		const header = contentEl.createDiv({ cls: "qoima-sync-modal-status" });
		const iconEl = header.createSpan({ cls: "qoima-sync-icon" });
		setIcon(iconEl, icon);
		iconEl.toggleClass("qoima-sync-spin", status.kind === "syncing" && status.waiting === null);
		header.createSpan({ text });

		if (status.kind === "syncing" && status.total > 0) {
			contentEl.createEl("progress", {
				cls: "qoima-sync-progress",
				attr: { value: status.done, max: status.total },
			});
		}

		if (status.kind === "error") {
			contentEl.createEl("p", { text: status.message });
			contentEl.createEl("pre", { cls: "qoima-sync-error-details", text: status.details });
		}

		const info = contentEl.createDiv({ cls: "qoima-sync-info" });
		const row = (name: string) => {
			info.createDiv({ cls: "qoima-sync-info-name", text: name });
			return info.createDiv({ cls: "qoima-sync-info-value" });
		};

		const { owner, repo, branch, token } = settings;
		const repoEl = row(t("infoRepository"));
		if (token && owner && repo) {
			repoEl.createEl("a", {
				text: `${owner}/${repo}`,
				href: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}`,
			});
			row(t("infoBranch")).setText(branch);
		} else {
			repoEl.setText(t("infoNotConfigured"));
		}

		row(t("infoLastSync")).setText(lastSync ? plugin.formatDateTime(new Date(lastSync.at)) : t("infoNever"));
		if (lastSync) {
			row(t("infoChanges")).setText(
				t("infoChangesValue", { down: lastSync.downloaded, up: lastSync.uploaded, merged: lastSync.merged })
			);
		}

		row(t("infoAutoSync")).setText(
			settings.syncInterval > 0 ? t("infoAutoSyncEvery", { n: settings.syncInterval }) : t("infoAutoSyncOff")
		);

		if (lastSync && lastSync.conflicts.length > 0) {
			contentEl.createEl("p", { cls: "qoima-sync-info-name", text: t("infoConflicts") });
			const list = contentEl.createEl("ul", { cls: "qoima-sync-conflicts" });
			for (const path of lastSync.conflicts) {
				const link = list.createEl("li").createEl("a", { text: path, href: "#" });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					this.close();
					this.app.workspace.openLinkText(path, "");
				});
			}
		}

		const buttons = new Setting(contentEl);
		if (status.kind === "error") {
			buttons.addButton((button) =>
				button.setButtonText(t("buttonCopy")).onClick(async () => {
					await navigator.clipboard.writeText(`${status.message}\n\n${status.details}`);
					new Notice(t("noticeCopied"));
				})
			);
		}
		buttons.addButton((button) =>
			button
				.setButtonText(status.kind === "error" ? t("buttonRetry") : t("commandSync"))
				.setCta()
				.setDisabled(status.kind === "syncing")
				.onClick(() => plugin.sync())
		);
	}

	onClose() {
		if (this.plugin.statusModal === this) this.plugin.statusModal = null;
		this.contentEl.empty();
	}
}
