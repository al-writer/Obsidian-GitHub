import { arrayBufferToBase64, base64ToArrayBuffer, requestUrl } from "obsidian";

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
	sha: string | null;
}

function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

export class GitHubClient {
	private readonly base: string;

	constructor(private token: string, owner: string, repo: string) {
		this.base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const res = await requestUrl({
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

		if (res.status >= 400) {
			let message = `HTTP ${res.status}`;
			try {
				message = res.json?.message ?? message;
			} catch {
				// Not a JSON body.
			}
			const rateLimited =
				(res.status === 403 || res.status === 429) && res.headers["x-ratelimit-remaining"] === "0";
			throw new GitHubError(res.status, message, rateLimited);
		}

		try {
			return res.json as T;
		} catch {
			return undefined as T;
		}
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
