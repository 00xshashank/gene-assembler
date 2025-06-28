import type {
  Reads,
  DebruijnGraph,
  DebruijnParams,
  DebruijnLayoutParams,
  BloomFilter
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

// Utility function for Counter-like behavior
class Counter {
  private counts: Map<string, number> = new Map();
  
  increment(key: string): void {
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }
  
  decrement(key: string): void {
    this.counts.set(key, Math.max(0, (this.counts.get(key) || 0) - 1));
  }
  
  get(key: string): number {
    return this.counts.get(key) || 0;
  }
  
  entries(): [string, number][] {
    return Array.from(this.counts.entries());
  }
  
  keys(): string[] {
    return Array.from(this.counts.keys());
  }
}

// -------------------- Bloom filter --------------------
class BloomFilterImpl implements BloomFilter {
  size: number;
  hash_count: number;
  bits: number[];

  constructor(size: number = 10000, hash_count: number = 3) {
    this.size = size;
    this.hash_count = hash_count;
    this.bits = new Array(size).fill(0);
  }

  private hashes(item: string): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.hash_count; i++) {
      result.push(simpleHash(item + i.toString()) % this.size);
    }
    return result;
  }

  add(item: string): void {
    for (const pos of this.hashes(item)) {
      this.bits[pos] = 1;
    }
  }

  check(item: string): boolean {
    return this.hashes(item).every(pos => this.bits[pos] === 1);
  }
}

// -------------------- de Bruijn methods --------------------
function countKmers(reads: Reads, k: number): Counter {
  const counts = new Counter();
  for (const seq of Object.values(reads)) {
    for (let i = 0; i <= seq.length - k; i++) {
      const kmer = seq.substring(i, i + k);
      counts.increment(kmer);
    }
  }
  return counts;
}

function filterErrors(
  counts: Counter, 
  method: 'threshold' | 'bloom' = 'threshold', 
  threshold: number = 2, 
  bloom?: BloomFilterImpl
): Set<string> {
  if (method === 'threshold') {
    const result = new Set<string>();
    for (const [kmer, count] of counts.entries()) {
      if (count >= threshold) {
        result.add(kmer);
      }
    }
    return result;
  } else if (method === 'bloom') {
    if (!bloom) {
      bloom = new BloomFilterImpl(2 * counts.entries().length, 4);
      for (const [kmer, count] of counts.entries()) {
        if (count >= threshold) {
          bloom.add(kmer);
        }
      }
    }
    const result = new Set<string>();
    for (const kmer of counts.keys()) {
      if (bloom.check(kmer)) {
        result.add(kmer);
      }
    }
    return result;
  } else {
    return new Set(counts.keys());
  }
}

function buildDebruijnGraph(kmers: Set<string>): [DebruijnGraph, Counter, Counter] {
  const graph: DebruijnGraph = {};
  const indegree = new Counter();
  const outdegree = new Counter();

  for (const kmer of kmers) {
    const prefix = kmer.substring(0, kmer.length - 1);
    const suffix = kmer.substring(1);
    
    if (!graph[prefix]) {
      graph[prefix] = [];
    }
    graph[prefix].push(suffix);
    
    outdegree.increment(prefix);
    indegree.increment(suffix);
  }

  return [graph, indegree, outdegree];
}

function simplifyTips(graph: DebruijnGraph, indegree: Counter, outdegree: Counter): void {
  const tips: string[] = [];
  
  for (const node of Object.keys(graph)) {
    if (outdegree.get(node) === 1 && indegree.get(node) === 0) {
      tips.push(node);
    }
  }

  for (const tip of tips) {
    const next = graph[tip][0];
    graph[tip] = graph[tip].filter(n => n !== next);
    indegree.decrement(next);
    outdegree.decrement(tip);
  }
}

function findEulerianPath(
  graph: DebruijnGraph, 
  indegree: Counter, 
  outdegree: Counter, 
  method: 'hierholzer' | 'recursive' = 'hierholzer'
): string[] {
  // Return empty path if graph has no edges
  if (Object.keys(graph).length === 0) {
    return [];
  }

  // Pick start node: imbalance +1 or any
  let start: string | null = null;
  for (const node of Object.keys(graph)) {
    if (outdegree.get(node) - indegree.get(node) === 1) {
      start = node;
      break;
    }
  }

  if (start === null) {
    const nodes = Object.keys(graph);
    if (nodes.length > 0) {
      start = nodes[0];
    } else {
      return [];
    }
  }

  if (method === 'hierholzer') {
    const local: Record<string, string[]> = {};
    for (const [u, vs] of Object.entries(graph)) {
      local[u] = [...vs];
    }

    const stack: string[] = [start];
    const path: string[] = [];

    while (stack.length > 0) {
      const u = stack[stack.length - 1];
      if (local[u] && local[u].length > 0) {
        stack.push(local[u].shift()!);
      } else {
        path.push(stack.pop()!);
      }
    }

    return path.reverse();
  } else {
    const path: string[] = [];
    const graphCopy: DebruijnGraph = {};
    
    for (const [u, vs] of Object.entries(graph)) {
      graphCopy[u] = [...vs];
    }

    function dfs(u: string): void {
      while (graphCopy[u] && graphCopy[u].length > 0) {
        const v = graphCopy[u].pop()!;
        dfs(v);
      }
      path.push(u);
    }

    dfs(start);
    return path.reverse();
  }
}

function pathToSequence(path: string[]): string {
  if (path.length === 0) return '';
  
  let seq = path[0];
  for (let i = 1; i < path.length; i++) {
    seq += path[i][path[i].length - 1];
  }
  return seq;
}

export function runDebruijn(
  readsInput: string | string[],
  overlapCfg: { method: 'debruijn'; params: DebruijnParams },
  layoutCfg: { method: 'debruijn'; params: DebruijnLayoutParams },
  detectAlts: boolean = false
): { assemblies: string[]; branches: [number, number][] } {
  // Load reads
  let reads: Reads;
  if (typeof readsInput === 'string') {
    // Handle as comma-separated string
    const readList = readsInput.split(',').map(r => r.trim());
    reads = {};
    readList.forEach((seq, i) => {
      reads[`read${i}`] = seq;
    });
  } else if (Array.isArray(readsInput)) {
    reads = {};
    readsInput.forEach((seq, i) => {
      reads[`read${i}`] = seq;
    });
  } else {
    throw new Error("reads_input must be string or array of strings");
  }

  // Extract parameters
  const params = overlapCfg.params;
  const k = params.k || 31;
  const errMethod = params.error_filter || 'threshold';
  const threshold = params.threshold || 2;
  const eulerMethod = layoutCfg.params.euler || 'hierholzer';

  // Build deBruijn graph
  const counts = countKmers(reads, k);
  const goodKmers = filterErrors(counts, errMethod, threshold);
  const [graph, indeg, outdeg] = buildDebruijnGraph(goodKmers);
  
  simplifyTips(graph, indeg, outdeg);

  // Detect ambiguous branches
  const branchNodes: string[] = [];
  for (const [node, neighbors] of Object.entries(graph)) {
    if (neighbors.length > 1) {
      branchNodes.push(node);
    }
  }

  function assembleGraph(g: DebruijnGraph): string {
    const path = findEulerianPath(g, indeg, outdeg, eulerMethod);
    return pathToSequence(path);
  }

  const primary = assembleGraph(graph);
  const sequences: string[] = [primary];

  if (detectAlts && branchNodes.length > 0) {
    for (const node of branchNodes) {
      const neighbors = graph[node];
      if (neighbors.length < 2) {
        continue;
      }

      const altGraph: DebruijnGraph = {};
      for (const [u, vs] of Object.entries(graph)) {
        altGraph[u] = [...vs];
      }

      // Swap two outgoing edges
      [altGraph[node][0], altGraph[node][1]] = [altGraph[node][1], altGraph[node][0]];

      try {
        const altSeq = assembleGraph(altGraph);
        if (altSeq !== primary && altSeq.length > 0) {
          sequences.push(altSeq);
        }
      } catch (error) {
        // Skip this alternative if it fails
        console.warn(`Failed to assemble alternative for node ${node}:`, error);
      }
    }
  }

  // Convert branch nodes to the expected format [number, number][]
  // For deBruijn, we'll use the node index as both coordinates
  const branches: [number, number][] = branchNodes.map((_, index) => [index, index]);

  return {
    assemblies: sequences,
    branches: branches
  };
} 