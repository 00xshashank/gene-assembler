# Gene Assembly Visualizer

A modern web application for visualizing and comparing DNA sequence assembly algorithms with interactive 3D visualization.

## Overview

This project implements and visualizes two fundamental DNA sequence assembly algorithms:

- **[Overlap-Layout-Consensus (OLC)](https://en.wikipedia.org/wiki/Sequence_assembly#Overlap-layout-consensus)** - A traditional approach that finds overlaps between reads, creates a layout, and generates consensus sequences
- **[de Bruijn Graph (DBG)](https://en.wikipedia.org/wiki/De_Bruijn_graph)** - A graph-based approach that constructs a de Bruijn graph from k-mers and finds Eulerian paths

The application provides an interactive web interface with real-time 3D visualization of assembled sequences.

## Features

### 🧬 Assembly Algorithms
- **OLC Assembly** with multiple overlap detection methods:
  - k-mer based overlap detection
  - MinHash for approximate similarity
  - Smith-Waterman local alignment
  - Needleman-Wunsch global alignment
- **de Bruijn Graph Assembly** with:
  - Configurable k-mer size
  - Error filtering (threshold and Bloom filter)
  - Multiple Eulerian path algorithms

### 🎨 Interactive 3D Visualization
- Real-time 3D rendering of assembled DNA sequences
- Color-coded nucleotide bases (A=Red, C=Green, G=Blue, T=Yellow)
- Interactive camera controls (zoom, rotate, pan)
- Helical DNA-like structure representation

### 📊 User Interface
- **Input Methods**: Paste sequences or upload FASTA files
- **Parameter Configuration**: Adjustable algorithm parameters
- **Real-time Results**: Instant assembly results with timing information
- **Alternative Detection**: Identify ambiguous regions and branching paths
- **Performance Metrics**: Timing breakdown for each assembly step

### 🔧 Technical Features
- Built with React 19 and TypeScript
- 3D visualization using Three.js and React Three Fiber
- Modern UI with Flowbite React components
- Responsive design with Tailwind CSS
- Real-time parameter adjustment

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gene-assembly
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## Usage

### Basic Assembly

1. **Input Your Data**:
   - Choose between "Paste Reads" or "Upload FASTA File"
   - For paste input, enter DNA sequences (one per line)
   - For file input, upload a FASTA format file

2. **Select Assembly Method**:
   - **OLC**: Traditional overlap-based assembly
   - **deBruijn**: Graph-based assembly

3. **Configure Parameters**:
   - Click the "Parameters" panel to adjust algorithm settings
   - Different parameters are available based on the selected method

4. **Run Assembly**:
   - Click "Assemble" to start the process
   - View real-time results and timing information

5. **Explore Results**:
   - Examine the 3D visualization of assembled sequences
   - Switch between multiple assembly variants if detected
   - Review timing breakdown for performance analysis

### Algorithm Parameters

#### OLC Parameters
- **Overlap Method**: k-mer, MinHash, Smith-Waterman, or Needleman-Wunsch
- **Layout Method**: Greedy or Superstring approaches
- **Consensus Method**: Majority voting or POA (Partial Order Alignment)
- **Thresholds**: Minimum overlap requirements and scoring parameters

#### deBruijn Parameters
- **k-mer Size**: Length of k-mers for graph construction (typically 31)
- **Error Filter**: Threshold-based or Bloom filter error correction
- **Eulerian Path**: Hierholzer or recursive path finding algorithms

## Algorithm Details

### Overlap-Layout-Consensus (OLC)

The OLC algorithm works in three main phases:

1. **Overlap Phase**: Finds overlaps between all pairs of reads using various methods
2. **Layout Phase**: Arranges reads based on overlap information to create a consensus layout
3. **Consensus Phase**: Generates the final consensus sequence from the layout

**Wikipedia**: [Overlap-layout-consensus](https://en.wikipedia.org/wiki/Sequence_assembly#Overlap-layout-consensus)

### de Bruijn Graph (DBG)

The de Bruijn graph approach:

1. **Graph Construction**: Creates a graph where nodes are (k-1)-mers and edges are k-mers
2. **Graph Simplification**: Removes tips, bubbles, and compresses linear paths
3. **Path Finding**: Finds Eulerian paths through the graph to reconstruct sequences

**Wikipedia**: [De Bruijn graph](https://en.wikipedia.org/wiki/De_Bruijn_graph)

## Project Structure

```
gene-assembly/
├── src/
│   ├── components/
│   │   ├── OlcUI.tsx          # Main user interface
│   │   ├── Sequence3DViewer.tsx # 3D visualization component
│   │   └── Base3D.tsx         # Individual nucleotide 3D representation
│   ├── lib/
│   │   ├── OLC.ts             # OLC algorithm implementation
│   │   └── dbg.ts             # de Bruijn graph implementation
│   ├── types/
│   │   └── index.ts           # TypeScript type definitions
│   └── App.tsx                # Main application component
├── package.json
└── README.md
```

## Technologies Used

- **Frontend**: React 19, TypeScript
- **3D Graphics**: Three.js, React Three Fiber, @react-three/drei
- **UI Components**: Flowbite React
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Development**: ESLint, TypeScript compiler
