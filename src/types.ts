export type BaseColorMap = Record<string, number>

export interface BaseProps {
  position: [number, number, number]
  color: number
  nextPos?: [number, number, number]
}

export interface KmerParams {
  k: number;
}

export interface MinhashParams {
  num_hashes: number;
}

export interface AlignmentParams {
  match: number;
  mismatch: number;
  gap: number;
}

export interface GreedyLayoutParams {
  overlap_threshold: number;
}

export interface SuperstringLayoutParams {
  min_overlap: number;
}

export interface MajorityConsensusParams {
  window: number;
}

export interface DebruijnParams {
  k: number
  error_filter: 'threshold' | 'bloom'
  threshold: number
}

export interface DebruijnLayoutParams {
  euler: 'hierholzer' | 'recursive'
}

export interface BloomFilter {
  size: number;
  hash_count: number;
  bits: number[];
}

export type OverlapParams = KmerParams | MinhashParams | AlignmentParams | DebruijnParams | Record<string, never>;
export type LayoutParams = GreedyLayoutParams | SuperstringLayoutParams | DebruijnLayoutParams | Record<string, never>;
export type ConsensusParams = MajorityConsensusParams | Record<string, never>;

// OLC-specific types
export interface Reads {
  [key: string]: string;
}

export interface Overlaps {
  [key: string]: number;
}

export interface OverlapConfig {
  method: 'kmer' | 'minhash' | 'sw' | 'nw' | 'debruijn';
  params?: Record<string, any>;
}

export interface LayoutConfig {
  method: 'greedy' | 'superstring' | 'debruijn';
  params?: Record<string, any>;
}

export interface ConsensusConfig {
  method: 'majority' | 'poa' | 'none';
  params?: Record<string, any>;
}

export interface AssemblyResult {
  assemblies: string[];
  branches: [number, number][];
}

// deBruijn-specific types
export interface DebruijnGraph {
  [key: string]: string[];
}

export interface DebruijnResult {
  assemblies: string[];
  branches: string[];
}