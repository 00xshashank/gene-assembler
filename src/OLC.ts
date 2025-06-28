import type {
  Reads,
  Overlaps,
  OverlapConfig,
  LayoutConfig,
  ConsensusConfig,
  AssemblyResult
} from './types';

function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

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

function loadReads(inputData: string | string[]): Reads {
    if (typeof inputData === 'string') {
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
    const ids = Object.keys(reads);
    
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const [, length] = smithWaterman(reads[ids[i]], reads[ids[j]], match, mismatch, gap);
            if (length > 5) {
                overlaps[`${ids[i]},${ids[j]}`] = length;
            }
        }
    }
    
    return overlaps;
}

function nwGlobal(a: string, b: string, match: number = 1, mismatch: number = -1, gap: number = -1): number {
    const n = a.length;
    const m = b.length;
    const H: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    
    for (let i = 1; i <= n; i++) {
        H[i][0] = H[i - 1][0] + gap;
    }
    for (let j = 1; j <= m; j++) {
        H[0][j] = H[0][j - 1] + gap;
    }
    
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const diag = H[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? match : mismatch);
            const up = H[i - 1][j] + gap;
            const left = H[i][j - 1] + gap;
            H[i][j] = Math.max(diag, up, left);
        }
    }
    
    return H[n][m];
}

function overlapNw(reads: Reads, match: number = 1, mismatch: number = -1, gap: number = -1): Overlaps {
    const overlaps: Overlaps = {};
    const ids = Object.keys(reads);
    
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const score = nwGlobal(reads[ids[i]], reads[ids[j]], match, mismatch, gap);
            if (score > 0) {
                overlaps[`${ids[i]},${ids[j]}`] = score;
            }
        }
    }
    
    return overlaps;
}

function layoutGreedy(reads: Reads, overlaps: Overlaps, overlapThreshold: number = 10): string[] {
    const edges: [string, string, number][] = [];
    
    for (const [key, score] of Object.entries(overlaps)) {
        if (score >= overlapThreshold) {
            const [r1, r2] = key.split(',');
            edges.push([r1, r2, score]);
        }
    }
    
    edges.sort((a, b) => b[2] - a[2]);
    
    const used = new Set<string>();
    const order: string[] = [];
    
    if (edges.length > 0) {
        order.push(edges[0][0]);
        used.add(edges[0][0]);
    }
    
    while (order.length < Object.keys(reads).length) {
        let bestNext: string | null = null;
        let bestScore = 0;
        
        for (const [r1, r2, score] of edges) {
            if (order[order.length - 1] === r1 && !used.has(r2)) {
                if (score > bestScore) {
                    bestScore = score;
                    bestNext = r2;
                }
            }
        }
        
        if (bestNext) {
            order.push(bestNext);
            used.add(bestNext);
        } else {
            for (const rid of Object.keys(reads)) {
                if (!used.has(rid)) {
                    order.push(rid);
                    used.add(rid);
                    break;
                }
            }
        }
    }
    
    return order;
}

function layoutSuperstring(reads: Reads, overlaps: Overlaps, minOverlap: number = 5): string[] {
    const ids = Object.keys(reads);
    let bestOrder: string[] = [];
    let bestLen = Infinity;
    
    if (ids.length <= 8) {
        const perms = permutations(ids);
        for (const order of perms) {
            let s = reads[order[0]];
            let ok = true;
            
            for (let i = 1; i < order.length; i++) {
                // const prev = reads[order[i - 1]];
                const curr = reads[order[i]];
                const ov = overlaps[`${order[i - 1]},${order[i]}`] || overlaps[`${order[i]},${order[i - 1]}`] || 0;
                
                if (ov < minOverlap) {
                    ok = false;
                    break;
                }
                
                s += curr.substring(ov);
            }
            
            if (ok && s.length < bestLen) {
                bestLen = s.length;
                bestOrder = order;
            }
        }
    }
    
    return bestOrder || [];
}

function consensusMajority(seq: string, reads: Reads): string {
    const votes: Counter[] = Array(seq.length).fill(null).map(() => new Counter());
    
    for (let i = 0; i < seq.length; i++) {
        votes[i].increment(seq[i]);
    }
    
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
    
    const cons = votes.map(cnt => {
        const mostCommon = cnt.mostCommon(1);
        return mostCommon.length > 0 ? mostCommon[0][0] : 'N';
    }).join('');
    
    return cons;
}

function consensusPoa(order: string[], reads: Reads): string {
    let cons = reads[order[0]];
    
    for (let i = 1; i < order.length; i++) {
        const rid = order[i];
        const rseq = reads[rid];
        
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
        // const cp = consensusCfg.params || {};
        
        switch (cm) {
            case 'majority':
                return consensusMajority(seq, reads);
            case 'poa':
                return consensusPoa(pathEdges, reads);
            default:
                throw new Error(`Unknown consensus method ${cm}`);
        }
    }
    
    const primary = order;
    const assembled = assemble(primary);
    const results = [assembled];
    
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