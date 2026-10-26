import { App, Modal, Notice, Setting } from "obsidian";
import type { Translate } from "./i18n";

/** Shows the last sync error in full, since the status bar only has room for "sync error". */
export class ErrorModal extends Modal {
	constructor(
		app: App,
		private t: Translate,
		private message: string,
		private details: string,
		private onRetry: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl, t } = this;
		this.setTitle(t("errorTitle"));
		contentEl.createEl("p", { text: this.message });
		contentEl.createEl("pre", { cls: "qoima-sync-error-details", text: this.details });
		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(t("buttonCopy")).onClick(async () => {
					await navigator.clipboard.writeText(`${this.message}\n\n${this.details}`);
					new Notice(t("noticeCopied"));
				})
			)
			.addButton((button) =>
				button
					.setButtonText(t("buttonRetry"))
					.setCta()
					.onClick(() => {
						this.close();
						this.onRetry();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
