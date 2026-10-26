import { Notice, Plugin, setIcon } from "obsidian";
import { ErrorModal } from "./error-modal";
import { GitHubClient, GitHubError } from "./github";
import { LOCALES, resolveLanguage, Translate, translator } from "./i18n";
import { DEFAULT_SETTINGS, QoimaSyncSettings, QoimaSyncSettingTab } from "./settings";
import {
	HashCache,
	MassDeletionError,
	SyncEngine,
	SyncResult,
	SyncState,
	SyncStore,
	TruncatedTreeError,
} from "./sync";

interface PluginData {
	settings?: Partial<QoimaSyncSettings>;
	state?: SyncState | null;
	cache?: HashCache;
	uploaded?: string[];
}

type Status =
	| { kind: "idle" }
	| { kind: "syncing"; done: number; total: number; waiting: number | null }
	| { kind: "synced"; at: Date; conflicts: number }
	| { kind: "error"; message: string; details: string };

/**
 * After GitHub's rate limit stops a sync, it resumes by itself after this delay.
 * Uploaded files are remembered, so every run gets further.
 */
const RATE_LIMIT_RESUME = 15 * 60_000;

export default class QoimaSyncPlugin extends Plugin {
	settings: QoimaSyncSettings;
	t: Translate;

	private store: SyncStore;
	private status: Status = { kind: "idle" };
	private statusBarEl: HTMLElement;
	private statusIconEl: HTMLElement;
	private statusTextEl: HTMLElement;
	private ribbonEl: HTMLElement;
	private progress: Notice | null = null;
	private running: Promise<void> | null = null;
	private intervalId: number | null = null;
	private resumeId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new QoimaSyncSettingTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: this.t("commandSync"),
			callback: () => this.sync(),
		});

		this.ribbonEl = this.addRibbonIcon("refresh-cw", this.t("ribbonSync"), () => this.sync());

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("mod-clickable", "qoima-sync-status");
		this.statusIconEl = this.statusBarEl.createSpan({ cls: "qoima-sync-icon" });
		this.statusTextEl = this.statusBarEl.createSpan();
		this.registerDomEvent(this.statusBarEl, "click", () => {
			const { status } = this;
			if (status.kind !== "error") return this.sync();
			new ErrorModal(this.app, this.t, status.message, status.details, () => this.sync()).open();
		});
		this.renderStatus();
		this.register(() => this.cancelResume());

		// Wait until the vault is fully indexed before the startup sync.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.syncOnStartup) this.sync();
			this.scheduleSync();
		});

		// Obsidian waits for tasks added here before quitting (desktop only, best effort).
		this.registerEvent(
			this.app.workspace.on("quit", (tasks) => {
				if (this.settings.syncOnQuit) tasks.add(() => this.syncBeforeQuit());
			})
		);
	}

	private async syncBeforeQuit() {
		// Let a running sync finish first, then send the latest changes.
		await this.running;
		await this.sync(true);
	}

	/** (Re)starts the periodic sync timer according to the settings. */
	scheduleSync() {
		if (this.intervalId !== null) window.clearInterval(this.intervalId);
		this.intervalId = null;
		const minutes = this.settings.syncInterval;
		if (minutes > 0) {
			this.intervalId = this.registerInterval(window.setInterval(() => this.sync(true), minutes * 60_000));
		}
	}

	/** `background` is the periodic sync: it stays quiet unless there is something to report. */
	async sync(background = false) {
		if (this.running) {
			if (!background) new Notice(this.t("noticeAlreadyRunning"));
			return;
		}

		const { token, owner, repo } = this.settings;
		if (!token || !owner || !repo) {
			if (!background) new Notice(this.t("noticeNotConfigured"));
			return;
		}

		this.running = this.runSync(background);
		try {
			await this.running;
		} finally {
			this.running = null;
		}
	}

	private cancelResume() {
		if (this.resumeId !== null) window.clearTimeout(this.resumeId);
		this.resumeId = null;
	}

	private async runSync(background: boolean) {
		const { token, owner, repo, branch, deletionGuard } = this.settings;
		this.cancelResume();
		const previous = this.status;
		this.progress = this.settings.showNotices && !background ? new Notice(this.t("noticeSyncing"), 0) : null;
		this.setStatus({ kind: "syncing", done: 0, total: 0, waiting: null });
		const update = (change: Partial<Extract<Status, { kind: "syncing" }>>) => {
			if (this.status.kind === "syncing") this.setStatus({ ...this.status, ...change });
		};

		try {
			const engine = new SyncEngine(
				this.app,
				new GitHubClient(token, owner, repo, (wait) =>
					update({ waiting: wait === null ? null : Date.now() + wait })
				),
				{
					owner,
					repo,
					branch,
					deletionGuard,
					commitMessage: `Vault sync: ${this.app.vault.getName()}, ${new Date().toISOString()}`,
					onProgress: (done, total) => update({ done, total }),
				},
				this.store
			);
			const result = await engine.sync();
			this.setStatus({ kind: "synced", at: new Date(), conflicts: result.conflicts.length });
			this.notifyResult(result, background);
		} catch (e) {
			console.error("Qoima Sync failed", e);
			let message = this.describeError(e);
			if (e instanceof GitHubError && e.rateLimited) {
				const at = new Date(Date.now() + RATE_LIMIT_RESUME);
				message += ". " + this.t("errResume", { time: this.formatTime(at) });
				this.resumeId = window.setTimeout(() => {
					this.resumeId = null;
					this.sync(true);
				}, RATE_LIMIT_RESUME);
			}
			this.setStatus({ kind: "error", message, details: this.errorDetails(e) });
			// Do not repeat the same error on every periodic run.
			if (!background || previous.kind !== "error" || previous.message !== message) {
				new Notice(this.t("noticeError", { message }), 10000);
			}
		} finally {
			this.progress?.hide();
			this.progress = null;
		}
	}

	private notifyResult(result: SyncResult, background: boolean) {
		if (result.conflicts.length > 0) {
			// Conflicts need attention, so they are shown even with notifications turned off.
			new Notice(
				this.t("noticeConflicts", { n: result.conflicts.length, files: result.conflicts.join("\n") }),
				0
			);
		}
		if (!this.settings.showNotices) return;
		if (result.downloaded + result.uploaded + result.merged === 0) {
			if (!background) new Notice(this.t("noticeUpToDate"));
		} else {
			new Notice(
				this.t("noticeDone", { down: result.downloaded, up: result.uploaded, merged: result.merged })
			);
		}
	}

	describeError(e: unknown): string {
		if (e instanceof MassDeletionError) return this.t("errMassDelete", { n: e.count });
		if (e instanceof TruncatedTreeError) return this.t("errTruncated");
		if (e instanceof GitHubError) {
			if (e.rateLimited) return this.t("errRateLimit");
			if (e.status === 401) return this.t("errAuth");
			if (e.status === 403) return this.t("errForbidden");
			if (e.status === 404) return this.t("errNotFound");
			if (e.status >= 500) return this.t("errServer", { status: e.status, request: e.request });
			return `${e.message} (HTTP ${e.status})`;
		}
		// requestUrl rejects without a status when the network is unavailable.
		if (e instanceof Error && /net::|ENOTFOUND|ECONN|ETIMEDOUT|Failed to fetch/i.test(e.message)) {
			return this.t("errNetwork");
		}
		return (e instanceof Error ? e.message : String(e)) || this.t("errUnknown");
	}

	/** The raw error, shown in the error window to help tell what went wrong. */
	private errorDetails(e: unknown): string {
		const lines = [new Date().toLocaleString(LOCALES[resolveLanguage(this.settings.language)])];
		if (e instanceof GitHubError) lines.push(`HTTP ${e.status} ${e.request}`.trim());
		if (e instanceof Error) lines.push(`${e.name}: ${e.message}`);
		else lines.push(String(e));
		return lines.join("\n");
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString(LOCALES[resolveLanguage(this.settings.language)], {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	private setStatus(status: Status) {
		this.status = status;
		this.renderStatus();
	}

	private renderStatus() {
		const { status } = this;
		let text: string;
		let icon = "refresh-cw";
		let tooltip = this.t("statusTooltip");
		switch (status.kind) {
			case "idle":
				text = this.t("statusIdle");
				break;
			case "syncing": {
				const counter = status.total > 0 ? ` ${status.done}/${status.total}` : "";
				const seconds = status.waiting === null ? 0 : Math.ceil((status.waiting - Date.now()) / 1000);
				text = status.waiting === null ? this.t("statusSyncing") + counter : this.t("statusWaiting");
				if (status.waiting !== null) icon = "clock";
				this.progress?.setMessage(
					status.waiting === null
						? this.t("noticeSyncing") + counter
						: this.t("noticeWaiting", { s: seconds })
				);
				break;
			}
			case "synced": {
				const time = this.formatTime(status.at);
				text =
					status.conflicts > 0
						? this.t("statusConflicts", { n: status.conflicts })
						: this.t("statusSynced", { time });
				icon = status.conflicts > 0 ? "alert-triangle" : "check";
				break;
			}
			case "error":
				text = this.t("statusError");
				tooltip = `${status.message}\n${this.t("statusTooltipError")}`;
				icon = "alert-circle";
				break;
		}
		const spinning = status.kind === "syncing" && status.waiting === null;
		setIcon(this.statusIconEl, icon);
		this.statusIconEl.toggleClass("qoima-sync-spin", spinning);
		this.ribbonEl.toggleClass("qoima-sync-spin", spinning);
		this.statusTextEl.setText(text);
		this.statusBarEl.setAttribute("aria-label", tooltip);
		this.statusBarEl.setAttribute("data-tooltip-position", "top");
	}

	async loadSettings() {
		const data: PluginData = (await this.loadData()) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.store = {
			state: data.state ?? null,
			cache: data.cache ?? {},
			uploaded: data.uploaded ?? [],
			save: () => this.saveAll(),
		};
		this.t = translator(resolveLanguage(this.settings.language));
	}

	async saveSettings() {
		this.t = translator(resolveLanguage(this.settings.language));
		if (this.statusBarEl) this.renderStatus();
		await this.saveAll();
	}

	private async saveAll() {
		const { state, cache, uploaded } = this.store;
		const data: PluginData = { settings: this.settings, state, cache, uploaded };
		await this.saveData(data);
	}
}
