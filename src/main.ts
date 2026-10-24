import { Notice, Plugin } from "obsidian";
import { GitHubClient, GitHubError } from "./github";
import { LOCALES, Translate, translator } from "./i18n";
import { DEFAULT_SETTINGS, GitHubSyncSettings, GitHubSyncSettingTab } from "./settings";
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
	settings?: Partial<GitHubSyncSettings>;
	state?: SyncState | null;
	cache?: HashCache;
}

type Status =
	| { kind: "idle" }
	| { kind: "syncing" }
	| { kind: "synced"; at: Date; conflicts: number }
	| { kind: "error"; message: string };

export default class GitHubSyncPlugin extends Plugin {
	settings: GitHubSyncSettings;
	t: Translate;

	private store: SyncStore;
	private status: Status = { kind: "idle" };
	private statusBarEl: HTMLElement;
	private running: Promise<void> | null = null;
	private intervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new GitHubSyncSettingTab(this.app, this));

		this.addCommand({
			id: "sync-now",
			name: this.t("commandSync"),
			callback: () => this.sync(),
		});

		this.addRibbonIcon("refresh-cw", this.t("ribbonSync"), () => this.sync());

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("mod-clickable");
		this.registerDomEvent(this.statusBarEl, "click", () => this.sync());
		this.renderStatus();

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

	private async runSync(background: boolean) {
		const { token, owner, repo, branch, deletionGuard } = this.settings;
		const previous = this.status;
		this.setStatus({ kind: "syncing" });
		const progress = this.settings.showNotices && !background ? new Notice(this.t("noticeSyncing"), 0) : null;

		try {
			const engine = new SyncEngine(
				this.app,
				new GitHubClient(token, owner, repo),
				{
					owner,
					repo,
					branch,
					deletionGuard,
					commitMessage: `Vault sync: ${this.app.vault.getName()}, ${new Date().toISOString()}`,
				},
				this.store
			);
			const result = await engine.sync();
			this.setStatus({ kind: "synced", at: new Date(), conflicts: result.conflicts.length });
			this.notifyResult(result, background);
		} catch (e) {
			console.error("GitHub Sync failed", e);
			const message = this.describeError(e);
			this.setStatus({ kind: "error", message });
			// Do not repeat the same error on every periodic run.
			if (!background || previous.kind !== "error" || previous.message !== message) {
				new Notice(this.t("noticeError", { message }), 10000);
			}
		} finally {
			progress?.hide();
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
			return e.message;
		}
		// requestUrl rejects without a status when the network is unavailable.
		if (e instanceof Error && /net::|ENOTFOUND|ECONN|ETIMEDOUT|Failed to fetch/i.test(e.message)) {
			return this.t("errNetwork");
		}
		return e instanceof Error ? e.message : String(e);
	}

	private setStatus(status: Status) {
		this.status = status;
		this.renderStatus();
	}

	private renderStatus() {
		const { status } = this;
		let text: string;
		let tooltip = this.t("statusTooltip");
		switch (status.kind) {
			case "idle":
				text = this.t("statusIdle");
				break;
			case "syncing":
				text = this.t("statusSyncing");
				break;
			case "synced": {
				const time = status.at.toLocaleTimeString(LOCALES[this.settings.language], {
					hour: "2-digit",
					minute: "2-digit",
				});
				text =
					status.conflicts > 0
						? this.t("statusConflicts", { n: status.conflicts })
						: this.t("statusSynced", { time });
				break;
			}
			case "error":
				text = this.t("statusError");
				tooltip = `${status.message}\n${tooltip}`;
				break;
		}
		this.statusBarEl.setText(text);
		this.statusBarEl.setAttribute("aria-label", tooltip);
		this.statusBarEl.setAttribute("data-tooltip-position", "top");
	}

	async loadSettings() {
		const data: PluginData = (await this.loadData()) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.store = { state: data.state ?? null, cache: data.cache ?? {}, save: () => this.saveAll() };
		this.t = translator(this.settings.language);
	}

	async saveSettings() {
		this.t = translator(this.settings.language);
		if (this.statusBarEl) this.renderStatus();
		await this.saveAll();
	}

	private async saveAll() {
		const data: PluginData = { settings: this.settings, state: this.store.state, cache: this.store.cache };
		await this.saveData(data);
	}
}
