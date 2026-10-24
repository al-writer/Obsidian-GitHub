// Line-based three-way merge (diff3), the same approach git uses for text files.

const MAX_LCS_CELLS = 4_000_000;

/** For every line of `a`, the index of the matching line in `b` (longest common subsequence), or -1. */
function matchLines(a: string[], b: string[]): Int32Array | null {
	const n = a.length;
	const m = b.length;
	const match = new Int32Array(n).fill(-1);

	let pre = 0;
	while (pre < n && pre < m && a[pre] === b[pre]) {
		match[pre] = pre;
		pre++;
	}
	let suf = 0;
	while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) {
		match[n - 1 - suf] = m - 1 - suf;
		suf++;
	}

	const an = n - pre - suf;
	const bm = m - pre - suf;
	if (an === 0 || bm === 0) return match;
	if (an * bm > MAX_LCS_CELLS) return null;

	const w = bm + 1;
	const dp = new Uint32Array((an + 1) * w);
	for (let i = an - 1; i >= 0; i--) {
		for (let j = bm - 1; j >= 0; j--) {
			dp[i * w + j] =
				a[pre + i] === b[pre + j]
					? dp[(i + 1) * w + j + 1] + 1
					: Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
		}
	}

	let i = 0;
	let j = 0;
	while (i < an && j < bm) {
		if (a[pre + i] === b[pre + j]) {
			match[pre + i] = pre + j;
			i++;
			j++;
		} else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return match;
}

function sameLines(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((line, i) => line === b[i]);
}

/**
 * Merges `ours` and `theirs`, both derived from `base`.
 * Returns the merged text, or null if the same region was changed differently on both sides.
 */
export function merge3(base: string, ours: string, theirs: string): string | null {
	const o = base.split("\n");
	const a = ours.split("\n");
	const b = theirs.split("\n");

	const ma = matchLines(o, a);
	const mb = matchLines(o, b);
	if (!ma || !mb) return null;

	const out: string[] = [];
	let i = 0;
	let ia = 0;
	let ib = 0;

	for (;;) {
		// Stable line: unchanged on both sides.
		if (i < o.length && ma[i] === ia && mb[i] === ib) {
			out.push(o[i]);
			i++;
			ia++;
			ib++;
			continue;
		}

		// Changed chunk up to the next base line present on both sides.
		let j = i;
		while (j < o.length && (ma[j] < 0 || mb[j] < 0)) j++;
		const endA = j < o.length ? ma[j] : a.length;
		const endB = j < o.length ? mb[j] : b.length;

		const chunkO = o.slice(i, j);
		const chunkA = a.slice(ia, endA);
		const chunkB = b.slice(ib, endB);

		if (sameLines(chunkA, chunkO)) {
			out.push(...chunkB);
		} else if (sameLines(chunkB, chunkO) || sameLines(chunkA, chunkB)) {
			out.push(...chunkA);
		} else {
			return null;
		}

		if (j >= o.length) break;
		i = j;
		ia = endA;
		ib = endB;
	}

	return out.join("\n");
}
