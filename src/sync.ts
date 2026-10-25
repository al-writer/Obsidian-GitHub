import { App, TFile, TFolder } from "obsidian";
import { GitHubClient, GitHubError, NewTreeEntry } from "./github";
import { merge3 } from "./merge";

/** Snapshot of the branch after the last successful sync: the common base for three-way comparison. */
export interface SyncState {
	key: string;
	commit: string;
	files: Record<string, string>;
}

/** Cached git blob SHAs of local files, so unchanged files are not re-hashed on every sync. */
export type HashCache = Record<string, { mtime: number; size: number; sha: string }>;

export interface SyncStore {
	state: SyncState | null;
	cache: HashCache;
	/** Blobs already uploaded by a sync that did not finish, so a retry does not upload them again. */
	uploaded: string[];
	save(): Promise<void>;
}

export interface SyncOptions {
	owner: string;
	repo: string;
	branch: string;
	deletionGuard: boolean;
	commitMessage: string;
	/** Called as file actions complete, starting with (0, total). */
	onProgress?: (done: number, total: number) => void;
}

export interface SyncResult {
	downloaded: number;
	uploaded: number;
	merged: number;
	conflicts: string[];
}

export class MassDeletionError extends Error {
	constructor(public count: number) {
		super(`Refusing to delete ${count} files`);
	}
}

export class TruncatedTreeError extends Error {}

class BranchMovedError extends Error {}

type Action =
	| { type: "download"; path: string; sha: string }
	| { type: "deleteLocal"; path: string }
	| { type: "upload"; path: string }
	| { type: "deleteRemote"; path: string }
	| { type: "conflict"; path: string; base?: string; remote: string };

const TEXT_EXTENSIONS = new Set([
	"md", "txt", "canvas", "json", "csv", "tsv", "css", "js", "ts", "html", "htm", "xml",
	"svg", "yml", "yaml", "toml", "ini", "tex", "bib", "org", "rst", "adoc", "base",
]);

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4;
/** Text files up to this size are sent inline in the tree instead of as separate blobs. */
const INLINE_LIMIT = 1024 * 1024;
/** Approximate request size at which a large tree is split into several requests. */
const TREE_CHUNK_SIZE = 4 * 1024 * 1024;

/** Obsidian hides dotfiles and dot-folders (including .obsidian), so they are never synced. */
function isSyncable(path: string): boolean {
	return !path.split("/").some((part) => part.startsWith("."));
}

function extension(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function decodeText(data: ArrayBuffer): string | null {
	try {
		// Keep the BOM, so that encoding the text again gives the same bytes.
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
	} catch {
		return null;
	}
}

async function gitBlobSha(data: ArrayBuffer): Promise<string> {
	const header = new TextEncoder().encode(`blob ${data.byteLength}\0`);
	const buf = new Uint8Array(header.length + data.byteLength);
	buf.set(header);
	buf.set(new Uint8Array(data), header.length);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", buf));
	return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function runPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) {
			await fn(items[next++]);
		}
	});
	await Promise.all(workers);
}

function timestamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export class SyncEngine {
	private readonly key: string;

	constructor(
		private app: App,
		private client: GitHubClient,
		private options: SyncOptions,
		private store: SyncStore
	) {
		this.key = `${options.owner}/${options.repo}#${options.branch}`;
	}

	async sync(): Promise<SyncResult> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.syncOnce();
			} catch (e) {
				// Remember the uploaded blobs and hashes for the next attempt.
				await this.store.save();
				// Someone pushed between our read and our write: start over with the new remote state.
				if (e instanceof BranchMovedError && attempt < MAX_ATTEMPTS) continue;
				throw e;
			}
		}
	}

	private async syncOnce(): Promise<SyncResult> {
		const result: SyncResult = { downloaded: 0, uploaded: 0, merged: 0, conflicts: [] };
		const local = await this.scanLocal();

		const head = await this.resolveHead(local);
		if (!head) return result;

		const treeSha = await this.client.getCommitTree(head);
		const tree = await this.client.getTree(treeSha);
		if (tree.truncated) throw new TruncatedTreeError();

		const remote = new Map<string, string>();
		const modes = new Map<string, string>();
		for (const entry of tree.entries) {
			if (entry.type !== "blob" || entry.mode === "120000" || !isSyncable(entry.path)) continue;
			remote.set(entry.path, entry.sha);
			modes.set(entry.path, entry.mode);
		}

		const base = this.store.state?.key === this.key ? this.store.state.files : {};
		const actions = this.plan(local, remote, base);
		this.checkDeletions(actions, base);
		let done = 0;
		this.options.onProgress?.(done, actions.length);

		const finalRemote = new Map(remote);
		const treeEntries: NewTreeEntry[] = [];
		const taken = new Set([...local.keys(), ...remote.keys()]);
		const entry = (path: string, blob: Pick<NewTreeEntry, "sha" | "content">): NewTreeEntry => ({
			path,
			mode: modes.get(path) ?? "100644",
			type: "blob",
			...blob,
		});

		const pushLocal = async (path: string, data: ArrayBuffer) => {
			const sha = await gitBlobSha(data);
			const text = data.byteLength <= INLINE_LIMIT ? decodeText(data) : null;
			if (text !== null) {
				// GitHub limits how fast content can be created, so text goes inline with the tree.
				treeEntries.push(entry(path, { content: text }));
			} else {
				if (!this.store.uploaded.includes(sha)) {
					await this.client.createBlob(data);
					this.store.uploaded.push(sha);
				}
				treeEntries.push(entry(path, { sha }));
			}
			finalRemote.set(path, sha);
			result.uploaded++;
		};

		await runPool(actions, async (action) => {
			switch (action.type) {
				case "download": {
					await this.writeLocal(action.path, await this.client.getBlob(action.sha), action.sha);
					result.downloaded++;
					break;
				}
				case "deleteLocal": {
					const file = this.app.vault.getAbstractFileByPath(action.path);
					if (file instanceof TFile) await this.app.fileManager.trashFile(file);
					delete this.store.cache[action.path];
					result.downloaded++;
					break;
				}
				case "upload": {
					await pushLocal(action.path, await this.readLocal(action.path));
					break;
				}
				case "deleteRemote": {
					treeEntries.push(entry(action.path, { sha: null }));
					finalRemote.delete(action.path);
					result.uploaded++;
					break;
				}
				case "conflict": {
					const ours = await this.readLocal(action.path);
					const theirs = await this.client.getBlob(action.remote);
					const merged = await this.tryMerge(action.path, action.base, ours, theirs);
					if (merged) {
						const sha = await gitBlobSha(merged);
						await this.writeLocal(action.path, merged, sha);
						if (sha !== action.remote) await pushLocal(action.path, merged);
						result.merged++;
					} else {
						// Keep the local version in place and save the remote one as a conflict copy,
						// so nothing is lost and the user resolves it by hand.
						const copy = this.conflictPath(action.path, taken);
						await this.writeLocal(copy, theirs, action.remote);
						treeEntries.push(entry(copy, { sha: action.remote }));
						finalRemote.set(copy, action.remote);
						await pushLocal(action.path, ours);
						result.conflicts.push(action.path);
					}
					break;
				}
			}
			this.options.onProgress?.(++done, actions.length);
		});

		let newHead = head;
		if (treeEntries.length > 0) {
			const newTree = await this.createTree(treeSha, treeEntries);
			const commit = await this.client.createCommit(this.options.commitMessage, newTree, [head]);
			try {
				await this.client.updateBranch(this.options.branch, commit);
			} catch (e) {
				if (e instanceof GitHubError && e.status === 422) throw new BranchMovedError();
				throw e;
			}
			newHead = commit;
		}

		this.store.state = { key: this.key, commit: newHead, files: Object.fromEntries(finalRemote) };
		this.store.uploaded = [];
		await this.store.save();
		return result;
	}

	/** Creates the tree in several requests when it carries a lot of inline content. */
	private async createTree(baseTree: string, entries: NewTreeEntry[]): Promise<string> {
		let tree = baseTree;
		let chunk: NewTreeEntry[] = [];
		let size = 0;
		for (const e of entries) {
			chunk.push(e);
			size += e.path.length + (e.content?.length ?? 0);
			if (size >= TREE_CHUNK_SIZE) {
				tree = await this.client.createTree(tree, chunk);
				chunk = [];
				size = 0;
			}
		}
		if (chunk.length > 0) tree = await this.client.createTree(tree, chunk);
		return tree;
	}

	/** Returns the branch head, creating the branch if needed. Returns null when there is nothing to sync. */
	private async resolveHead(local: Map<string, string>): Promise<string | null> {
		const { branch } = this.options;
		try {
			const head = await this.client.getBranchHead(branch);
			if (head) return head;

			const defaultBranch = await this.client.getDefaultBranch();
			const defaultHead = await this.client.getBranchHead(defaultBranch);
			if (defaultHead) {
				await this.client.createBranch(branch, defaultHead);
				return defaultHead;
			}
		} catch (e) {
			// 409: the repository is empty.
			if (!(e instanceof GitHubError && e.status === 409)) throw e;
		}

		// Empty repository: the Git Data API does not work until the first commit exists,
		// so create it with one file through the Contents API.
		const first = [...local.keys()].sort()[0];
		if (!first) return null;
		await this.client.createFile(first, branch, await this.readLocal(first), this.options.commitMessage);
		return this.client.getBranchHead(branch);
	}

	private async scanLocal(): Promise<Map<string, string>> {
		const files = new Map<string, string>();
		const cache: HashCache = {};
		for (const file of this.app.vault.getFiles()) {
			if (!isSyncable(file.path)) continue;
			const cached = this.store.cache[file.path];
			let sha: string;
			if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
				sha = cached.sha;
			} else {
				sha = await gitBlobSha(await this.app.vault.readBinary(file));
			}
			cache[file.path] = { mtime: file.stat.mtime, size: file.stat.size, sha };
			files.set(file.path, sha);
		}
		this.store.cache = cache;
		return files;
	}

	/** Three-way comparison of local, remote and the base (last synced) state, as git does. */
	private plan(local: Map<string, string>, remote: Map<string, string>, base: Record<string, string>): Action[] {
		const actions: Action[] = [];
		const paths = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)]);

		for (const path of paths) {
			const l = local.get(path);
			const r = remote.get(path);
			const b = base[path];

			if (l === r) continue;
			if (l === b) {
				// Changed only on GitHub.
				actions.push(r ? { type: "download", path, sha: r } : { type: "deleteLocal", path });
			} else if (r === b) {
				// Changed only locally.
				actions.push(l ? { type: "upload", path } : { type: "deleteRemote", path });
			} else if (!l) {
				// Deleted locally but modified on GitHub: the modification wins.
				actions.push({ type: "download", path, sha: r as string });
			} else if (!r) {
				// Deleted on GitHub but modified locally: the modification wins.
				actions.push({ type: "upload", path });
			} else {
				actions.push({ type: "conflict", path, base: b, remote: r });
			}
		}
		return actions;
	}

	private checkDeletions(actions: Action[], base: Record<string, string>) {
		if (!this.options.deletionGuard) return;
		const total = Object.keys(base).length;
		for (const type of ["deleteLocal", "deleteRemote"]) {
			const count = actions.filter((a) => a.type === type).length;
			if (count > 10 && count > total / 2) throw new MassDeletionError(count);
		}
	}

	private async tryMerge(
		path: string,
		baseSha: string | undefined,
		ours: ArrayBuffer,
		theirs: ArrayBuffer
	): Promise<ArrayBuffer | null> {
		if (!TEXT_EXTENSIONS.has(extension(path))) return null;
		const baseData = baseSha ? await this.client.getBlob(baseSha) : new ArrayBuffer(0);
		const [o, a, b] = [baseData, ours, theirs].map(decodeText);
		if (o === null || a === null || b === null) return null;
		const merged = merge3(o, a, b);
		return merged === null ? null : (new TextEncoder().encode(merged).buffer as ArrayBuffer);
	}

	private conflictPath(path: string, taken: Set<string>): string {
		const slash = path.lastIndexOf("/");
		const dir = path.slice(0, slash + 1);
		const name = path.slice(slash + 1);
		const dot = name.lastIndexOf(".");
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : "";
		const label = `conflict ${timestamp()}`;

		let candidate = `${dir}${stem} (${label})${ext}`;
		for (let n = 2; taken.has(candidate); n++) {
			candidate = `${dir}${stem} (${label} ${n})${ext}`;
		}
		taken.add(candidate);
		return candidate;
	}

	private async readLocal(path: string): Promise<ArrayBuffer> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
		return this.app.vault.readBinary(file);
	}

	private async writeLocal(path: string, data: ArrayBuffer, sha: string): Promise<void> {
		const { vault } = this.app;
		let file = vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await vault.modifyBinary(file, data);
		} else {
			await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
			file = await vault.createBinary(path, data);
		}
		if (file instanceof TFile) {
			this.store.cache[path] = { mtime: file.stat.mtime, size: file.stat.size, sha };
		}
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		let current = "";
		for (const part of folder.split("/")) {
			current = current ? `${current}/${part}` : part;
			if (this.app.vault.getAbstractFileByPath(current) instanceof TFolder) continue;
			try {
				await this.app.vault.createFolder(current);
			} catch (e) {
				// Another parallel write may have created it already.
				if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw e;
			}
		}
	}
}
