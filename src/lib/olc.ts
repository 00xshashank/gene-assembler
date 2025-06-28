import type {
  Reads,
  Overlaps,
  OverlapConfig,
  LayoutConfig,
  ConsensusConfig,
  AssemblyResult
} from '../types';

// Simple hash function to replace crypto dependency
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

// Utility function to generate permutations
function permutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const perms = permutations(remaining);
        
        for (const perm of perms) {
            result.push([current, ...perm]);
        }
    }
    return result;
}

// Utility function for Counter-like behavior
class Counter {
    private counts: Map<string, number> = new Map();
    
    increment(key: string): void {
        this.counts.set(key, (this.counts.get(key) || 0) + 1);
    }
    
    mostCommon(n: number = 1): [string, number][] {
        return Array.from(this.counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, n);
    }
}

// Load reads from file or list
function loadReads(inputData: string | string[]): Reads {
    if (typeof inputData === 'string') {
        // Note: In a real implementation, you'd need to handle file reading
        // For now, we'll assume the string contains the file content
        const reads: Reads = {};
        const lines = inputData.split('\n');
        let header: string | null = null;
        let seq: string[] = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            if (trimmedLine.startsWith('>')) {
                if (header) reads[header] = seq.join('');
                header = trimmedLine.substring(1);
                seq = [];
            } else {
                seq.push(trimmedLine);
            }
        }
        
        if (header) reads[header] = seq.join('');
        return reads;
    } else if (Array.isArray(inputData)) {
        const reads: Reads = {};
        inputData.forEach((seq, i) => {
            reads[`read${i}`] = seq;
        });
        return reads;
    } else {
        throw new Error("reads_input must be filepath or list of sequences");
    }
}

// Overlap implementations
function overlapKmer(reads: Reads, k: number = 15): Overlaps {
    const index: Map<string, [string, number][]> = new Map();
    
    for (const [rid, seq] of Object.entries(reads)) {
        for (let i = 0; i <= seq.length - k; i++) {
            const kmer = seq.substring(i, i + k);
            if (!index.has(kmer)) {
                index.set(kmer, []);
            }
            index.get(kmer)!.push([rid, i]);
        }
    }
    
    const overlaps: Overlaps = {};
    
    for (const occs of index.values()) {
        for (let i = 0; i < occs.length; i++) {
            for (let j = i + 1; j < occs.length; j++) {
                const [r1] = occs[i];
                const [r2] = occs[j];
                if (r1 !== r2) {
                    const key = `${r1},${r2}`;
                    overlaps[key] = Math.max(overlaps[key] || 0, k);
                }
            }
        }
    }
    
    return overlaps;
}

function overlapMinhash(reads: Reads, numHashes: number = 100): Overlaps {
    const makeHash = (seed: number) => (x: string) => {
        return simpleHash(x + seed.toString());
    };
    
    const funcs = Array.from({ length: numHashes }, (_, i) => makeHash(i));
    
    const sketches: { [key: string]: number[] } = {};
    
    for (const [rid, seq] of Object.entries(reads)) {
        sketches[rid] = funcs.map(h => {
            const hashes = [];
            for (let i = 0; i <= seq.length - 5; i++) {
                hashes.push(h(seq.substring(i, i + 5)));
            }
            return Math.min(...hashes);
        });
    }
    
    const overlaps: Overlaps = {};
    const ids = Object.keys(sketches);
    
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const s1 = sketches[ids[i]];
            const s2 = sketches[ids[j]];
            const sim = s1.filter((a, idx) => a === s2[idx]).length / numHashes;
            if (sim > 0.1) {
                overlaps[`${ids[i]},${ids[j]}`] = sim;
            }
        }
    }
    
    return overlaps;
}

function smithWaterman(a: string, b: string, match: number = 2, mismatch: number = -1, gap: number = -1): [number, number] {
    const n = a.length;
    const m = b.length;
    const H: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    let maxPos: [number, number] = [0, 0];
    
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const diag = H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? match : mismatch);
            const up = H[i - 1][j] + gap;
            const left = H[i][j - 1] + gap;
            H[i][j] = Math.max(0, diag, up, left);
            
            if (H[i][j] > H[maxPos[0]][maxPos[1]]) {
                maxPos = [i, j];
            }
        }
    }
    
    // Compute local alignment length
    let [i, j] = maxPos;
    let length = 0;
    
    while (i > 0 && j > 0 && H[i][j] > 0) {
        length++;
        const scores = {
            diag: H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? match : mismatch),
            up: H[i - 1][j] + gap,
            left: H[i][j - 1] + gap
        };
        
        const move = Object.entries(scores).reduce((a, b) => 
            scores[a[0] as keyof typeof scores] > scores[b[0] as keyof typeof scores] ? a : b
        )[0];
        
        if (move === 'diag') {
            i--; j--;
        } else if (move === 'up') {
            i--;
        } else {
            j--;
        }
    }
    
    return [H[maxPos[0]][maxPos[1]], length];
}

function overlapSw(reads: Reads, match: number = 2, mismatch: number = -1, gap: number = -1): Overlaps {
    const overlaps: Overlaps = {};
    const keys = Object.keys(reads);
    
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const [, length] = smithWaterman(reads[keys[i]], reads[keys[j]], match, mismatch, gap);
            overlaps[`${keys[i]},${keys[j]}`] = length;
        }
    }
    
    return overlaps;
}

function nwGlobal(a: string, b: string, match: number = 1, mismatch: number = -1, gap: number = -1): number {
    const n = a.length;
    const m = b.length;
    const F: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    
    for (let i = 1; i <= n; i++) F[i][0] = i * gap;
    for (let j = 1; j <= m; j++) F[0][j] = j * gap;
    
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const diag = F[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? match : mismatch);
            const up = F[i - 1][j] + gap;
            const left = F[i][j - 1] + gap;
            F[i][j] = Math.max(diag, up, left);
        }
    }
    
    return F[n][m];
}

function overlapNw(reads: Reads, match: number = 1, mismatch: number = -1, gap: number = -1): Overlaps {
    const overlaps: Overlaps = {};
    const keys = Object.keys(reads);
    
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const length = nwGlobal(reads[keys[i]], reads[keys[j]], match, mismatch, gap);
            overlaps[`${keys[i]},${keys[j]}`] = length;
        }
    }
    
    return overlaps;
}

// Layout implementations
function layoutGreedy(reads: Reads, overlaps: Overlaps, overlapThreshold: number = 10): string[] {
    const unused = new Set(Object.keys(reads));
    const order: string[] = [];
    
    if (unused.size === 0) return order;
    
    let cur = Array.from(unused)[0];
    unused.delete(cur);
    order.push(cur);
    
    while (unused.size > 0) {
        let best: string | null = null;
        let bestScore = overlapThreshold;
        
        for (const r of unused) {
            const s = overlaps[`${cur},${r}`] || overlaps[`${r},${cur}`] || 0;
            if (s > bestScore) {
                best = r;
                bestScore = s;
            }
        }
        
        if (best) {
            unused.delete(best);
        } else {
            best = Array.from(unused)[0];
            unused.delete(best);
        }
        
        order.push(best);
        cur = best;
    }
    
    return order;
}

function layoutSuperstring(reads: Reads, overlaps: Overlaps, minOverlap: number = 5): string[] {
    let bestOrder: string[] | null = null;
    let bestLen = Infinity;
    
    const perms = permutations(Object.keys(reads));
    
    for (const order of perms) {
        let s = reads[order[0]];
        let ok = true;
        
        for (let i = 0; i < order.length - 1; i++) {
            const prev = order[i];
            const nxt = order[i + 1];
            const ov = overlaps[`${prev},${nxt}`] || overlaps[`${nxt},${prev}`] || 0;
            
            if (ov < minOverlap) {
                ok = false;
                break;
            }
            s += reads[nxt].substring(ov);
        }
        
        if (ok && s.length < bestLen) {
            bestLen = s.length;
            bestOrder = order;
        }
    }
    
    return bestOrder || [];
}

// Consensus implementations
function consensusMajority(seq: string, reads: Reads, window: number = 50): string {
    const votes: Counter[] = Array(seq.length).fill(null).map(() => new Counter());
    
    // Seed with initial seq
    for (let i = 0; i < seq.length; i++) {
        votes[i].increment(seq[i]);
    }
    
    // For each read, find its first occurrence in seq
    for (const read of Object.values(reads)) {
        const pos = seq.indexOf(read);
        if (pos >= 0) {
            for (let i = 0; i < read.length; i++) {
                if (pos + i < seq.length) {
                    votes[pos + i].increment(read[i]);
                }
            }
        }
    }
    
    // Build consensus
    const cons = votes.map(cnt => {
        const mostCommon = cnt.mostCommon(1);
        return mostCommon.length > 0 ? mostCommon[0][0] : 'N';
    }).join('');
    
    return cons;
}

function consensusPoa(order: string[], reads: Reads): string {
    // Very basic progressive consensus: global align reads to growing consensus
    let cons = reads[order[0]];
    
    for (let i = 1; i < order.length; i++) {
        const rid = order[i];
        const rseq = reads[rid];
        
        // Simple alignment - find longest common substring
        let bestMatch = '';
        let bestPos = 0;
        
        for (let j = 0; j <= cons.length - 10; j++) {
            for (let k = 0; k <= rseq.length - 10; k++) {
                let match = '';
                let pos = 0;
                while (j + pos < cons.length && k + pos < rseq.length && cons[j + pos] === rseq[k + pos]) {
                    match += cons[j + pos];
                    pos++;
                }
                if (match.length > bestMatch.length) {
                    bestMatch = match;
                    bestPos = j;
                }
            }
        }
        
        // Simple merge strategy
        if (bestMatch.length > 5) {
            cons = cons.substring(0, bestPos) + bestMatch + rseq.substring(bestMatch.length);
        } else {
            cons += rseq;
        }
    }
    
    return cons;
}

function runOlc(
    readsInput: string | string[],
    overlapCfg: OverlapConfig,
    layoutCfg: LayoutConfig,
    consensusCfg: ConsensusConfig,
    detectAlts: boolean = false
): AssemblyResult {
    const reads = loadReads(readsInput);
    
    const om = overlapCfg.method;
    const op = overlapCfg.params || {};
    let overlaps: Overlaps;
    
    switch (om) {
        case 'kmer':
            overlaps = overlapKmer(reads, op.k || 15);
            break;
        case 'minhash':
            overlaps = overlapMinhash(reads, op.numHashes || 100);
            break;
        case 'sw':
            overlaps = overlapSw(reads, op.match || 2, op.mismatch || -1, op.gap || -1);
            break;
        case 'nw':
            overlaps = overlapNw(reads, op.match || 1, op.mismatch || -1, op.gap || -1);
            break;
        default:
            throw new Error(`Unknown overlap method ${om}`);
    }
    
    const lm = layoutCfg.method;
    const lp = layoutCfg.params || {};
    let order: string[];
    
    switch (lm) {
        case 'greedy':
            order = layoutGreedy(reads, overlaps, lp.overlapThreshold || 10);
            break;
        case 'superstring':
            order = layoutSuperstring(reads, overlaps, lp.minOverlap || 5);
            break;
        default:
            throw new Error(`Unknown layout method ${lm}`);
    }
    
    const layoutEdges = new Set<string>();
    for (let i = 0; i < order.length - 1; i++) {
        layoutEdges.add(`${order[i]},${order[i + 1]}`);
    }
    
    const branches: [number, number][] = [];
    for (const [key, score] of Object.entries(overlaps)) {
        if (score > 0 && !layoutEdges.has(key)) {
            const [r1, r2] = key.split(',');
            const reverseKey = `${r2},${r1}`;
            if (!layoutEdges.has(reverseKey)) {
                branches.push([order.indexOf(r1), order.indexOf(r2)]);
            }
        }
    }
    
    function assemble(pathEdges: string[]): string {
        let seq = reads[pathEdges[0]];
        
        for (let i = 0; i < pathEdges.length - 1; i++) {
            const a = pathEdges[i];
            const b = pathEdges[i + 1];
            const ov = overlaps[`${a},${b}`] || overlaps[`${b},${a}`] || 0;
            seq += reads[b].substring(ov);
        }
        
        const cm = consensusCfg.method;
        const cp = consensusCfg.params || {};
        
        switch (cm) {
            case 'majority':
                return consensusMajority(seq, reads, cp.window || 50);
            case 'poa':
                return consensusPoa(pathEdges, reads);
            default:
                throw new Error(`Unknown consensus method ${cm}`);
        }
    }
    
    // Primary path
    const primary = order;
    const assembled = assemble(primary);
    const results = [assembled];
    
    // If alternatives requested, swap each branch in turn to create alternate paths
    if (detectAlts && branches.length > 0) {
        for (const [i, j] of branches) {
            const altOrder = [...primary];
            [altOrder[i], altOrder[j]] = [altOrder[j], altOrder[i]];
            
            try {
                const altSeq = assemble(altOrder);
                if (altSeq !== assembled) {
                    results.push(altSeq);
                }
            } catch (error) {
                console.error(error);
            }
        }
    }
    
    return { assemblies: results, branches };
}

export {
    loadReads,
    overlapKmer,
    overlapMinhash,
    overlapSw,
    overlapNw,
    layoutGreedy,
    layoutSuperstring,
    consensusMajority,
    consensusPoa,
    runOlc
};
