import { arrayBufferToBase64, base64ToArrayBuffer, requestUrl, RequestUrlResponse } from "obsidian";

export class GitHubError extends Error {
	constructor(public status: number, message: string, public rateLimited = false) {
		super(message);
	}
}

export interface TreeEntry {
	path: string;
	mode: string;
	type: string;
	sha: string;
}

export interface NewTreeEntry {
	path: string;
	mode: string;
	type: "blob";
	/** An existing blob, or null to delete the path. */
	sha?: string | null;
	/** Inline UTF-8 content: GitHub creates the blob itself, which saves a request per file. */
	content?: string;
}

const MAX_RETRIES = 4;
/** Longer rate limit waits are reported as an error instead. */
const MAX_WAIT = 5 * 60 * 1000;
/** GitHub asks to leave at least a second between write requests. */
const WRITE_INTERVAL = 1000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** How long to wait before retrying a rate-limited request, or null if it was not rate-limited. */
function rateLimitWait(res: RequestUrlResponse, message: string, attempt: number): number | null {
	if (res.status !== 403 && res.status !== 429) return null;
	const retryAfter = Number(res.headers["retry-after"]);
	if (retryAfter > 0) return retryAfter * 1000;
	if (res.headers["x-ratelimit-remaining"] === "0") {
		const reset = Number(res.headers["x-ratelimit-reset"]) * 1000;
		return reset > 0 ? Math.max(reset - Date.now(), 0) + 1000 : MAX_WAIT + 1;
	}
	// The secondary limit often comes without hints: wait at least a minute, then back off.
	if (/secondary rate limit/i.test(message)) return 60_000 * 2 ** attempt;
	return null;
}

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

export class GitHubClient {
	private readonly base: string;
	private writeQueue: Promise<unknown> = Promise.resolve();
	private lastWrite = 0;

	constructor(private token: string, owner: string, repo: string) {
		this.base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	}

	private request<T>(method: string, path: string, body?: unknown): Promise<T> {
		if (method === "GET") return this.send<T>(method, path, body);
		// Concurrent writes quickly trip GitHub's secondary rate limit, so they go one at a time.
		const result = this.writeQueue.then(async () => {
			await sleep(this.lastWrite + WRITE_INTERVAL - Date.now());
			this.lastWrite = Date.now();
			return this.send<T>(method, path, body);
		});
		this.writeQueue = result.catch(() => undefined);
		return result;
	}

	private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			const res = await this.fetch(method, path, body);
			if (res.status < 400) {
				try {
					return res.json as T;
				} catch {
					return undefined as T;
				}
			}

			let message = `HTTP ${res.status}`;
			try {
				message = res.json?.message ?? message;
			} catch {
				// Not a JSON body.
			}
			const wait = rateLimitWait(res, message, attempt);
			if (wait !== null && wait <= MAX_WAIT && attempt < MAX_RETRIES) {
				console.warn(`Qoima Sync: GitHub rate limit, retrying in ${Math.round(wait / 1000)} s`);
				await sleep(wait);
				continue;
			}
			throw new GitHubError(res.status, message, wait !== null);
		}
	}

	private fetch(method: string, path: string, body?: unknown): Promise<RequestUrlResponse> {
		return requestUrl({
			url: this.base + path,
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			contentType: body === undefined ? undefined : "application/json",
			body: body === undefined ? undefined : JSON.stringify(body),
			throw: false,
		});
	}

	async getDefaultBranch(): Promise<string> {
		const repo = await this.request<{ default_branch: string }>("GET", "");
		return repo.default_branch;
	}

	async listBranches(): Promise<string[]> {
		const names: string[] = [];
		for (let page = 1; page <= 10; page++) {
			const branches = await this.request<{ name: string }[]>("GET", `/branches?per_page=100&page=${page}`);
			names.push(...branches.map((b) => b.name));
			if (branches.length < 100) break;
		}
		return names;
	}

	/** Returns the commit SHA the branch points to, or null if the branch does not exist. */
	async getBranchHead(branch: string): Promise<string | null> {
		try {
			const ref = await this.request<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodePath(branch)}`);
			return ref.object.sha;
		} catch (e) {
			if (e instanceof GitHubError && e.status === 404) return null;
			throw e;
		}
	}

	async createBranch(branch: string, sha: string): Promise<void> {
		await this.request("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha });
	}

	/** Fast-forwards the branch. Throws GitHubError 422 if the branch moved in the meantime. */
	async updateBranch(branch: string, sha: string): Promise<void> {
		await this.request("PATCH", `/git/refs/heads/${encodePath(branch)}`, { sha, force: false });
	}

	async getCommitTree(commitSha: string): Promise<string> {
		const commit = await this.request<{ tree: { sha: string } }>("GET", `/git/commits/${commitSha}`);
		return commit.tree.sha;
	}

	async getTree(treeSha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
		const tree = await this.request<{ tree: TreeEntry[]; truncated: boolean }>(
			"GET",
			`/git/trees/${treeSha}?recursive=1`
		);
		return { entries: tree.tree, truncated: tree.truncated };
	}

	async getBlob(sha: string): Promise<ArrayBuffer> {
		const blob = await this.request<{ content: string }>("GET", `/git/blobs/${sha}`);
		return base64ToArrayBuffer(blob.content.replace(/\s/g, ""));
	}

	async createBlob(data: ArrayBuffer): Promise<string> {
		const blob = await this.request<{ sha: string }>("POST", "/git/blobs", {
			content: arrayBufferToBase64(data),
			encoding: "base64",
		});
		return blob.sha;
	}

	async createTree(baseTree: string, entries: NewTreeEntry[]): Promise<string> {
		const tree = await this.request<{ sha: string }>("POST", "/git/trees", { base_tree: baseTree, tree: entries });
		return tree.sha;
	}

	async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
		const commit = await this.request<{ sha: string }>("POST", "/git/commits", { message, tree, parents });
		return commit.sha;
	}

	/** Creates a file through the Contents API. Unlike the Git Data API, this works on an empty repository. */
	async createFile(path: string, branch: string, data: ArrayBuffer, message: string): Promise<void> {
		await this.request("PUT", `/contents/${encodePath(path)}`, {
			message,
			branch,
			content: arrayBufferToBase64(data),
		});
	}
}
