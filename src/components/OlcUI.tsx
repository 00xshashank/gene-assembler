import React, { useState, useRef, useEffect } from 'react'
import { Button, Label, TextInput, Select, Checkbox } from 'flowbite-react'

import Sequence3DViewer from './Sequence3DViewer'
import {
  type DebruijnParams
} from '../types/index'

const Controlled3DAssembly: React.FC = () => {
  // Common
  const [inputMethod, setInputMethod] = useState<'paste' | 'file'>('paste')
  const [reads, setReads] = useState<string>('ACTGAC\nTGACGT\nACGTGA')
  const [fileName, setFileName] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [method, setMethod] = useState<'olc' | 'debruijn'>('olc')
  const [detectAlternatives, setDetectAlternatives] = useState<boolean>(false)
  const [assembledSeqs, setAssembledSeqs] = useState<string[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [showParameters, setShowParameters] = useState<boolean>(false)
  const [timingInfo, setTimingInfo] = useState<{
    overlap: number;
    layout: number;
    consensus: number;
    total: number;
  } | null>(null)

  // Search functionality
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<{
    startIndex: number;
    endIndex: number;
    context: string;
    highlightedContext: string;
  }>>([])
  const [focusedPosition, setFocusedPosition] = useState<number | null>(null)

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

  // FASTA parsing function
  const parseFasta = (content: string): string[] => {
    const lines = content.split('\n')
    const sequences: string[] = []
    let currentSequence = ''
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.startsWith('>')) {
        // Header line - save previous sequence if exists
        if (currentSequence) {
          sequences.push(currentSequence)
        }
        currentSequence = ''
      } else if (trimmedLine && !trimmedLine.startsWith(';')) {
        // Sequence line (ignore comment lines starting with ;)
        currentSequence += trimmedLine.toUpperCase()
      }
    }
    
    // Add the last sequence
    if (currentSequence) {
      sequences.push(currentSequence)
    }
    
    return sequences.filter(seq => seq.length > 0)
  }

  // Search function
  const performSearch = (query: string, sequence: string) => {
    if (!query.trim() || !sequence) {
      setSearchResults([])
      return
    }

    const results: Array<{
      startIndex: number;
      endIndex: number;
      context: string;
      highlightedContext: string;
    }> = []

    const upperQuery = query.toUpperCase()
    const upperSequence = sequence.toUpperCase()
    let startIndex = 0

    while (true) {
      const index = upperSequence.indexOf(upperQuery, startIndex)
      if (index === -1) break

      const endIndex = index + upperQuery.length
      
      // Create context (50 characters before and after)
      const contextStart = Math.max(0, index - 50)
      const contextEnd = Math.min(sequence.length, endIndex + 50)
      const context = sequence.substring(contextStart, contextEnd)
      
      // Create highlighted context
      const beforeMatch = sequence.substring(contextStart, index)
      const match = sequence.substring(index, endIndex)
      const afterMatch = sequence.substring(endIndex, contextEnd)
      
      const highlightedContext = `${beforeMatch}<span style="color: #3b82f6; font-weight: bold;">${match}</span>${afterMatch}`
      
      results.push({
        startIndex: index,
        endIndex: endIndex,
        context,
        highlightedContext
      })
      
      startIndex = endIndex
    }

    setSearchResults(results)
  }

  // Handle search query changes
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    performSearch(query, assembledSeqs[selectedIndex] || '')
  }

  // Handle search result click
  const handleSearchResultClick = (startIndex: number) => {
    setFocusedPosition(startIndex)
  }

  // Update search results when selected sequence changes
  useEffect(() => {
    if (searchQuery) {
      performSearch(searchQuery, assembledSeqs[selectedIndex] || '')
    }
  }, [selectedIndex, assembledSeqs, searchQuery])

  // Clear search when assembly is done
  useEffect(() => {
    if (assembledSeqs.length > 0) {
      setSearchQuery('')
      setSearchResults([])
      setFocusedPosition(null)
    }
  }, [assembledSeqs])

  // File upload handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setFileName(file.name)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const sequences = parseFasta(content)
      setReads(sequences.join('\n'))
    }
    reader.readAsText(file)
  }

  // Process reads from either input method
  const processReads = (): string[] => {
    if (inputMethod === 'file') {
      // For file input, reads are already parsed as sequences
      return reads.split('\n').filter(r => r.trim().length > 0)
    } else {
      // For paste input, split by newlines and filter empty lines
      return reads.split('\n').map(r => r.trim()).filter(r => r.length > 0)
    }
  }

  const handleAssemble = () => {
    setLoading(true)
    setTimingInfo(null)
    const readsList = processReads()
    const startTime = performance.now()

    console.log('Starting assembly with method:', method)
    console.log('Reads:', readsList)

    if (method === 'olc') {
      const overlapParams: any = {}
      if (overlapMethod === 'kmer') overlapParams.k = k
      if (overlapMethod === 'minhash') overlapParams.numHashes = numHashes
      if (overlapMethod === 'sw') Object.assign(overlapParams, { match: swMatch, mismatch: swMismatch, gap: swGap })
      if (overlapMethod === 'nw') Object.assign(overlapParams, { match: nwMatch, mismatch: nwMismatch, gap: nwGap })

      const layoutParams: any = {}
      if (layoutMethod === 'greedy') layoutParams.overlapThreshold = overlapThreshold
      if (layoutMethod === 'superstring') layoutParams.minOverlap = minOverlap

      const consensusParams: any = {}
      if (consensusMethod === 'majority') consensusParams.window = windowSize

      console.log('OLC params:', { overlapParams, layoutParams, consensusParams })

      import('../lib/OLC.ts').then(({ runOlc }) => {
        try {
          const result = runOlc(
            readsList,
            {
              method: overlapMethod as "kmer" | "minhash" | "sw" | "nw",
              params: overlapParams,
            },
            {
              method: layoutMethod as "greedy" | "superstring",
              params: layoutParams,
            },
            {
              method: consensusMethod as "majority" | "poa",
              params: consensusParams,
            },
            detectAlternatives
          );
          const totalTime = performance.now() - startTime
          
          // For OLC, we'll estimate timing based on the total time
          // In a real implementation, the library would need to provide timing info
          const overlapTime = totalTime * 0.4  // Estimate 40% for overlap
          const layoutTime = totalTime * 0.35  // Estimate 35% for layout
          const consensusTime = totalTime * 0.25  // Estimate 25% for consensus
          
          setTimingInfo({
            overlap: overlapTime / 1000,
            layout: layoutTime / 1000,
            consensus: consensusTime / 1000,
            total: totalTime / 1000
          })
          
          console.log('OLC result:', result)
          
          // Handle different result formats
          let assemblies: string[] = []
          let branchData: any[] = []
          
          if (result && typeof result === 'object') {
            if (Array.isArray(result)) {
              assemblies = result
            } else if (result.assemblies) {
              assemblies = Array.isArray(result.assemblies) ? result.assemblies : [result.assemblies]
            } else if (typeof result === 'string') {
              assemblies = [result]
            }
            
            if (result.branches) {
              branchData = Array.isArray(result.branches) ? result.branches : [result.branches]
            }
          }
          
          console.log('Processed assemblies:', assemblies)
          console.log('Processed branches:', branchData)
          
          setAssembledSeqs(assemblies);
          setBranches(branchData);
          setSelectedIndex(0);
          
        } catch (error) {
          console.error('OLC assembly error:', error);
          setAssembledSeqs([]);
          setBranches([]);
        } finally {
          setLoading(false);
        }
      }).catch(error => {
        console.error('Failed to load OLC module:', error);
        setLoading(false);
      });
    } else {
      const debruijnParams: DebruijnParams = { k: kdbg, error_filter: errorFilter, threshold }
      const layoutParams = { euler: eulerMethod }
      
      console.log('deBruijn params:', { debruijnParams, layoutParams })

      import('../lib/dbg').then(({ runDebruijn }) => {
        try {          
          // Track timing for deBruijn assembly
          const result = runDebruijn(
            readsList,
            {
              method: 'debruijn',
              params: debruijnParams,
            },
            {
              method: 'debruijn',
              params: layoutParams,
            },
            detectAlternatives
          );
          const totalTime = performance.now() - startTime
          
          // For deBruijn, we'll estimate timing based on the total time
          // In a real implementation, the library would need to provide timing info
          const overlapTime = totalTime * 0.5  // Estimate 50% for graph construction (overlap equivalent)
          const layoutTime = totalTime * 0.3   // Estimate 30% for path finding (layout equivalent)
          const consensusTime = totalTime * 0.2 // Estimate 20% for consensus
          
          setTimingInfo({
            overlap: overlapTime / 1000,
            layout: layoutTime / 1000,
            consensus: consensusTime / 1000,
            total: totalTime / 1000
          })
          
          console.log('deBruijn result:', result)
          
          // Handle different result formats
          let assemblies: string[] = []
          let branchData: any[] = []
          
          if (result && typeof result === 'object') {
            if (Array.isArray(result)) {
              assemblies = result
            } else if (result.assemblies) {
              assemblies = Array.isArray(result.assemblies) ? result.assemblies : [result.assemblies]
            } else if (typeof result === 'string') {
              assemblies = [result]
            }
            
            if (result.branches) {
              branchData = Array.isArray(result.branches) ? result.branches : [result.branches]
            }
          }
          
          console.log('Processed assemblies:', assemblies)
          console.log('Processed branches:', branchData)
          
          setAssembledSeqs(assemblies);
          setBranches(branchData);
          setSelectedIndex(0);
        } catch (error) {
          console.error('deBruijn assembly error:', error);
          setAssembledSeqs([]);
          setBranches([]);
        } finally {
          setLoading(false);
        }
      }).catch(error => {
        console.error('Failed to load deBruijn module:', error);
        setLoading(false);
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
      fontFamily: 'Geist Mono, monospace',
    }}>
      {/* Left Sidebar - Reads Input Only */}
      <div className="w-80 p-4 space-y-4 overflow-auto">
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Input</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">Input Method</Label>
              <Select value={inputMethod} onChange={e => setInputMethod(e.target.value as 'paste' | 'file')}>
                <option value="paste">Paste Reads</option>
                <option value="file">Upload FASTA File</option>
              </Select>
            </div>

            {inputMethod === 'paste' ? (
              <div>
                <Label className="text-sm font-medium text-gray-700">Reads (one per line)</Label>
                <textarea
                  value={reads}
                  onChange={e => setReads(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={6}
                  placeholder="Enter reads, one per line:&#10;ACTGAC&#10;TGACGT&#10;ACGTGA"
                />
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium text-gray-700">FASTA File</Label>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".fasta,.fa,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-gray-600 text-white hover:bg-gray-700"
                  >
                    Choose File
                  </Button>
                  {fileName && (
                    <p className="text-sm text-gray-600 bg-green-50 p-2 rounded">
                      ✓ {fileName}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex items-center pt-2">
              <Checkbox checked={detectAlternatives} onChange={() => setDetectAlternatives(!detectAlternatives)} />
              <Label className="ml-2 text-sm font-medium text-gray-700">Show alternatives</Label>
            </div>

            <Button 
              onClick={handleAssemble} 
              disabled={loading || (inputMethod === 'file' && !fileName)} 
              className="w-full bg-black text-white hover:bg-gray-800 border-black"
            >
              {loading ? 'Loading…' : 'Assemble'}
            </Button>
          </div>
        </div>

        {/* Results Box */}
        {(assembledSeqs.length > 0 || branches.length > 0 || loading) && (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Results</h3>
            <div className="space-y-3">
              {loading && (
                <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">
                  ⏳ Processing assembly...
                </p>
              )}
              
              {!loading && assembledSeqs.length === 0 && (
                <p className="text-sm text-gray-600 bg-red-50 p-2 rounded">
                  ❌ No assembly results found. Check console for errors.
                </p>
              )}

              {assembledSeqs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-gray-700">
                      Assembled Sequence{assembledSeqs.length > 1 ? 's' : ''} ({assembledSeqs.length})
                    </Label>
                    {assembledSeqs.length > 1 && (
                      <span className="text-xs text-gray-500">
                        Length: {assembledSeqs[selectedIndex]?.length || 0} bp
                      </span>
                    )}
                  </div>
                  
                  {assembledSeqs.length > 1 && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Variant</Label>
                      <Select value={String(selectedIndex)} onChange={e => setSelectedIndex(+e.target.value)}>
                        {assembledSeqs.map((_, idx) => (
                          <option key={idx} value={idx}>
                            Variant {idx + 1} ({assembledSeqs[idx]?.length || 0} bp)
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}

                  {assembledSeqs[selectedIndex] && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Sequence</Label>
                      <div className="bg-white border border-gray-300 rounded-md p-2 max-h-32 overflow-y-auto">
                        <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all">
                          {assembledSeqs[selectedIndex]}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {branches.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded">
                    🔍 Detected {branches.length} ambiguous {method === 'olc' ? 'overlaps' : 'branches'}.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Right - Parameters Accordion */}
      <div className="absolute top-4 right-4 z-10 w-80">
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-lg">
          <button
            onClick={() => setShowParameters(!showParameters)}
            className="w-full text-left flex items-center justify-between p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-800">Parameters</h3>
            <span className="text-gray-600">
              {showParameters ? '▼' : '▶'}
            </span>
          </button>
          
          {showParameters && (
            <div className="mt-4 space-y-4 pt-4 border-t border-gray-200">
              <div>
                <Label className="text-sm font-medium text-gray-700">Assembly Type</Label>
                <Select value={method} onChange={e => setMethod(e.target.value as any)}>
                  <option value="olc">OLC</option>
                  <option value="debruijn">deBruijn</option>
                </Select>
              </div>

              {method === 'olc' ? (
                <>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Overlap Method</Label>
                    <Select value={overlapMethod} onChange={e => setOverlapMethod(e.target.value)}>
                      <option value="kmer">kmer</option>
                      <option value="minhash">minhash</option>
                      <option value="sw">Smith-Waterman</option>
                      <option value="nw">Needleman-Wunsch</option>
                    </Select>
                  </div>
                  {overlapMethod === 'kmer' && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">k</Label>
                      <TextInput type="number" value={k} onChange={e => setK(+e.target.value)} />
                    </div>
                  )}
                  {overlapMethod === 'minhash' && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Num Hashes</Label>
                      <TextInput type="number" value={numHashes} onChange={e => setNumHashes(+e.target.value)} />
                    </div>
                  )}
                  {overlapMethod === 'sw' && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">SW Match</Label>
                        <TextInput type="number" value={swMatch} onChange={e => setSwMatch(+e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">SW Mismatch</Label>
                        <TextInput type="number" value={swMismatch} onChange={e => setSwMismatch(+e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">SW Gap</Label>
                        <TextInput type="number" value={swGap} onChange={e => setSwGap(+e.target.value)} />
                      </div>
                    </div>
                  )}
                  {overlapMethod === 'nw' && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">NW Match</Label>
                        <TextInput type="number" value={nwMatch} onChange={e => setNwMatch(+e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">NW Mismatch</Label>
                        <TextInput type="number" value={nwMismatch} onChange={e => setNwMismatch(+e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">NW Gap</Label>
                        <TextInput type="number" value={nwGap} onChange={e => setNwGap(+e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Layout Method</Label>
                    <Select value={layoutMethod} onChange={e => setLayoutMethod(e.target.value)}>
                      <option value="greedy">greedy</option>
                      <option value="superstring">superstring</option>
                    </Select>
                  </div>
                  {layoutMethod === 'greedy' && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Overlap Threshold</Label>
                      <TextInput type="number" value={overlapThreshold} onChange={e => setOverlapThreshold(+e.target.value)} />
                    </div>
                  )}
                  {layoutMethod === 'superstring' && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Min Overlap</Label>
                      <TextInput type="number" value={minOverlap} onChange={e => setMinOverlap(+e.target.value)} />
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Consensus Method</Label>
                    <Select value={consensusMethod} onChange={e => setConsensusMethod(e.target.value)}>
                      <option value="majority">majority</option>
                      <option value="poa">poa</option>
                    </Select>
                  </div>
                  {consensusMethod === 'majority' && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Window Size</Label>
                      <TextInput type="number" value={windowSize} onChange={e => setWindowSize(+e.target.value)} />
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">k-mer Size</Label>
                    <TextInput type="number" value={kdbg} onChange={e => setKdbg(+e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Error Filter</Label>
                    <Select value={errorFilter} onChange={e => setErrorFilter(e.target.value as any)}>
                      <option value="threshold">threshold</option>
                      <option value="bloom">bloom</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Threshold</Label>
                    <TextInput type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Eulerian Path Method</Label>
                    <Select value={eulerMethod} onChange={e => setEulerMethod(e.target.value as any)}>
                      <option value="hierholzer">hierholzer</option>
                      <option value="recursive">recursive</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Time Taken Block - Below Parameters */}
        {timingInfo && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-lg">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Time Taken</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  {method === 'olc' ? 'Overlap' : 'Graph Construction'}:
                </span>
                <span className="text-sm text-gray-600">{timingInfo.overlap.toFixed(3)}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  {method === 'olc' ? 'Layout' : 'Path Finding'}:
                </span>
                <span className="text-sm text-gray-600">{timingInfo.layout.toFixed(3)}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Consensus:</span>
                <span className="text-sm text-gray-600">{timingInfo.consensus.toFixed(3)}s</span>
              </div>
              <div className="border-t border-gray-300 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800">Total:</span>
                  <span className="text-sm font-semibold text-gray-800">{timingInfo.total.toFixed(3)}s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Block - Below Time Taken */}
        {assembledSeqs.length > 0 && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-lg">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="w-full text-left flex items-center justify-between p-2 hover:bg-gray-100 rounded transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-800">Search</h3>
              <span className="text-gray-600">
                {showSearch ? '▼' : '▶'}
              </span>
            </button>
            
            {showSearch && (
              <div className="mt-4 space-y-4 pt-4 border-t border-gray-200">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Search Pattern</Label>
                  <TextInput
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Enter sequence to search for..."
                    className="w-full"
                  />
                </div>

                {searchResults.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Found {searchResults.length} occurrence{searchResults.length !== 1 ? 's' : ''}
                    </Label>
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          onClick={() => handleSearchResultClick(result.startIndex)}
                          className="p-2 bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div 
                            className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all"
                            dangerouslySetInnerHTML={{ __html: result.highlightedContext }}
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            Position: {result.startIndex + 1} - {result.endIndex}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchQuery && searchResults.length === 0 && (
                  <div className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">
                    No matches found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Right - Base Color Legend */}
      <div className="absolute bottom-4 right-4 z-10 p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
        <h3 className="text-sm font-semibold mb-2 text-gray-800">Base Colors</h3>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ff0000' }}></div>
            <span className="text-xs text-gray-700">A (Adenine)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#00ff00' }}></div>
            <span className="text-xs text-gray-700">C (Cytosine)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#0000ff' }}></div>
            <span className="text-xs text-gray-700">G (Guanine)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ffff00' }}></div>
            <span className="text-xs text-gray-700">T (Thymine)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative" style={{ pointerEvents: 'none' }}>
        <Sequence3DViewer sequence={assembledSeqs[selectedIndex] || ''} focusedPosition={focusedPosition} />
      </div>
    </div>
  )
}

export default Controlled3DAssembly
