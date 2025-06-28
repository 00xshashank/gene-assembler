import React, { useState } from 'react'
import { Button, Label, TextInput, Select, Checkbox } from 'flowbite-react'

import Sequence3DViewer from './Sequence3DViewer'
import {
  type KmerParams,
  type MinhashParams,
  type GreedyLayoutParams,
  type SuperstringLayoutParams,
  type OverlapParams,
  type ConsensusParams,
  type LayoutParams,
  type DebruijnParams
} from '../types/index'

const Controlled3DAssembly: React.FC = () => {
  // Common
  const [reads, setReads] = useState<string>('ACTGAC,TGACGT,ACGTGA')
  const [method, setMethod] = useState<'olc' | 'debruijn'>('olc')
  const [detectAlternatives, setDetectAlternatives] = useState<boolean>(false)
  const [assembledSeqs, setAssembledSeqs] = useState<string[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)

  // OLC params
  const [overlapMethod, setOverlapMethod] = useState<string>('kmer')
  const [k, setK] = useState<number>(3)
  const [numHashes, setNumHashes] = useState<number>(100)
  const [swMatch, setSwMatch] = useState<number>(2)
  const [swMismatch, setSwMismatch] = useState<number>(-1)
  const [swGap, setSwGap] = useState<number>(-1)
  const [nwMatch, setNwMatch] = useState<number>(1)
  const [nwMismatch, setNwMismatch] = useState<number>(-1)
  const [nwGap, setNwGap] = useState<number>(-1)
  const [layoutMethod, setLayoutMethod] = useState<string>('greedy')
  const [overlapThreshold, setOverlapThreshold] = useState<number>(2)
  const [minOverlap, setMinOverlap] = useState<number>(5)
  const [consensusMethod, setConsensusMethod] = useState<string>('majority')
  const [windowSize, setWindowSize] = useState<number>(50)

  // deBruijn params
  const [kdbg, setKdbg] = useState<number>(31)
  const [errorFilter, setErrorFilter] = useState<'threshold' | 'bloom'>('threshold')
  const [threshold, setThreshold] = useState<number>(2)
  const [eulerMethod, setEulerMethod] = useState<'hierholzer' | 'recursive'>('hierholzer')

  const handleAssemble = () => {
    setLoading(true)
    const readsList = reads.split(',').map(r => r.trim())

    const payload: any = { reads_input: readsList, detect_alternatives: detectAlternatives }

    if (method === 'olc') {
      const overlapParams: OverlapParams = {}
      if (overlapMethod === 'kmer') (overlapParams as unknown as KmerParams).k = k
      if (overlapMethod === 'minhash') (overlapParams as unknown as MinhashParams).num_hashes = numHashes
      if (overlapMethod === 'sw') Object.assign(overlapParams, { match: swMatch, mismatch: swMismatch, gap: swGap })
      if (overlapMethod === 'nw') Object.assign(overlapParams, { match: nwMatch, mismatch: nwMismatch, gap: nwGap })

      const layoutParams: LayoutParams = {}
      if (layoutMethod === 'greedy') (layoutParams as unknown as GreedyLayoutParams).overlap_threshold = overlapThreshold
      if (layoutMethod === 'superstring') (layoutParams as unknown as SuperstringLayoutParams).min_overlap = minOverlap

      const consensusParams: ConsensusParams = {}
      if (consensusMethod === 'majority') (consensusParams as ConsensusParams).window = windowSize

      payload.overlap = { method: overlapMethod, params: overlapParams }
      payload.layout = { method: layoutMethod, params: layoutParams }
      payload.consensus = { method: consensusMethod, params: consensusParams }
    } else {
      const debruijnParams: DebruijnParams = { k: kdbg, error_filter: errorFilter, threshold }
      payload.overlap = { method: 'debruijn', params: debruijnParams }
      payload.layout = { method: 'debruijn', params: { euler: eulerMethod } }
      payload.consensus = { method: 'none', params: {} }
    }

    if (method === 'olc') {
      import('../lib/OLC').then(({ runOlc }) => {
        try {
          const result = runOlc(
            readsList,
            {
              method: overlapMethod as "kmer" | "minhash" | "sw" | "nw",
              params: payload.overlap.params,
            },
            {
              method: layoutMethod as "greedy" | "superstring",
              params: payload.layout.params,
            },
            {
              method: consensusMethod as "majority" | "poa",
              params: payload.consensus.params,
            },
            detectAlternatives
          );
          setAssembledSeqs(result.assemblies || []);
          setBranches(result.branches || []);
          setSelectedIndex(0);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      });
    } else {
      import('../lib/dbg').then(({ runDebruijn }) => {
        try {
          const result = runDebruijn(
            readsList,
            {
              method: 'debruijn',
              params: payload.overlap.params,
            },
            {
              method: 'debruijn',
              params: payload.layout.params,
            },
            detectAlternatives
          );
          setAssembledSeqs(result.assemblies || []);
          setBranches(result.branches || []);
          setSelectedIndex(0);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      });
    }
  }

  return (
    <div className="flex h-screen"
    style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundImage: `
        linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)`,
      backgroundSize: '20px 20px',
    }}>
      <div className="w-80 p-4 bg-white shadow-lg space-y-4 overflow-auto">
        <div>
          <Label>Assembly Type</Label>
          <Select value={method} onChange={e => setMethod(e.target.value as any)}>
            <option value="olc">OLC</option>
            <option value="debruijn">deBruijn</option>
          </Select>
        </div>
        <div>
          <Label>Reads (comma-separated)</Label>
          <TextInput value={reads} onChange={e => setReads(e.target.value)} />
        </div>

        {method === 'olc' ? (
          <>
            <div>
              <Label>Overlap Method</Label>
              <Select value={overlapMethod} onChange={e => setOverlapMethod(e.target.value)}>
                <option value="kmer">kmer</option>
                <option value="minhash">minhash</option>
                <option value="sw">Smith-Waterman</option>
                <option value="nw">Needleman-Wunsch</option>
              </Select>
            </div>
            {overlapMethod === 'kmer' && (
              <div>
                <Label>k</Label>
                <TextInput type="number" value={k} onChange={e => setK(+e.target.value)} />
              </div>
            )}
            {overlapMethod === 'minhash' && (
              <div>
                <Label>Num Hashes</Label>
                <TextInput type="number" value={numHashes} onChange={e => setNumHashes(+e.target.value)} />
              </div>
            )}
            {overlapMethod === 'sw' && (
              <div>
                <Label>SW Match</Label>
                <TextInput type="number" value={swMatch} onChange={e => setSwMatch(+e.target.value)} />
                <Label>SW Mismatch</Label>
                <TextInput type="number" value={swMismatch} onChange={e => setSwMismatch(+e.target.value)} />
                <Label>SW Gap</Label>
                <TextInput type="number" value={swGap} onChange={e => setSwGap(+e.target.value)} />
              </div>
            )}
            {overlapMethod === 'nw' && (
              <div>
                <Label>NW Match</Label>
                <TextInput type="number" value={nwMatch} onChange={e => setNwMatch(+e.target.value)} />
                <Label>NW Mismatch</Label>
                <TextInput type="number" value={nwMismatch} onChange={e => setNwMismatch(+e.target.value)} />
                <Label>NW Gap</Label>
                <TextInput type="number" value={nwGap} onChange={e => setNwGap(+e.target.value)} />
              </div>
            )}

            <div>
              <Label>Layout Method</Label>
              <Select value={layoutMethod} onChange={e => setLayoutMethod(e.target.value)}>
                <option value="greedy">greedy</option>
                <option value="superstring">superstring</option>
              </Select>
            </div>
            {layoutMethod === 'greedy' && (
              <div>
                <Label>Overlap Threshold</Label>
                <TextInput type="number" value={overlapThreshold} onChange={e => setOverlapThreshold(+e.target.value)} />
              </div>
            )}
            {layoutMethod === 'superstring' && (
              <div>
                <Label>Min Overlap</Label>
                <TextInput type="number" value={minOverlap} onChange={e => setMinOverlap(+e.target.value)} />
              </div>
            )}

            <div>
              <Label>Consensus Method</Label>
              <Select value={consensusMethod} onChange={e => setConsensusMethod(e.target.value)}>
                <option value="majority">majority</option>
                <option value="poa">poa</option>
              </Select>
            </div>
            {consensusMethod === 'majority' && (
              <TextInput type="number" value={windowSize} onChange={e => setWindowSize(+e.target.value)} />
            )}
          </>
        ) : (
          <>
            <div>
              <Label>k-mer Size</Label>
              <TextInput type="number" value={kdbg} onChange={e => setKdbg(+e.target.value)} />
            </div>
            <div>
              <Label>Error Filter</Label>
              <Select value={errorFilter} onChange={e => setErrorFilter(e.target.value as any)}>
                <option value="threshold">threshold</option>
                <option value="bloom">bloom</option>
              </Select>
            </div>
            <div>
              <Label>Threshold</Label>
              <TextInput type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} />
            </div>
            <div>
              <Label>Eulerian Path Method</Label>
              <Select value={eulerMethod} onChange={e => setEulerMethod(e.target.value as any)}>
                <option value="hierholzer">hierholzer</option>
                <option value="recursive">recursive</option>
              </Select>
            </div>
          </>
        )}

        <div className="flex items-center">
          <Checkbox checked={detectAlternatives} onChange={() => setDetectAlternatives(!detectAlternatives)} />
          <Label className="ml-2">Detect alternatives</Label>
        </div>

        <Button onClick={handleAssemble} disabled={loading} color="primary">
          {loading ? 'Loading…' : 'Assemble'}
        </Button>

        {assembledSeqs.length > 1 && (
          <>
            <Label>Variant</Label>
            <Select value={String(selectedIndex)} onChange={e => setSelectedIndex(+e.target.value)}>
              {assembledSeqs.map((_, idx) => (
                <option key={idx} value={idx}>
                  Variant {idx + 1}
                </option>
              ))}
            </Select>
          </>
        )}

        {branches.length > 0 && (
          <p className="text-sm text-gray-600">
            Detected {branches.length} ambiguous {method === 'olc' ? 'overlaps' : 'branches'}.
          </p>
        )}
      </div>

      <div className="flex-1 relative" style={{ pointerEvents: 'none' }}>
        <Sequence3DViewer sequence={assembledSeqs[selectedIndex] || ''} />
      </div>
    </div>
  )
}

export default Controlled3DAssembly
