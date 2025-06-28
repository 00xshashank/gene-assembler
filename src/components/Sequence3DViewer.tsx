import { Canvas } from "@react-three/fiber"
import { OrbitControls } from '@react-three/drei'
import type { BaseColorMap } from "../types"
import Base3D from "./Base3D"

interface Sequence3DViewerProps {
  sequence: string
}

const BASE_COLORS: BaseColorMap = {
  A: 0xff0000,
  C: 0x00ff00,
  G: 0x0000ff,
  T: 0xffff00,
}

const Sequence3DViewer: React.FC<Sequence3DViewerProps> = ({ sequence }) => {
  const positions: [number, number, number][] = sequence.split('').map((_, i) => {
    const angle = i * 0.4
    return [Math.cos(angle) * 2, Math.sin(angle) * 2, i * 0.5]
  })

  return (
    <Canvas camera={{ position: [0, 0, 10] }} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} />
      <OrbitControls enableZoom enableRotate />
      {sequence.split('').map((base, i) => (
        <Base3D
          key={i}
          position={positions[i]}
          color={BASE_COLORS[base] ?? 0xffffff}
          nextPos={positions[i + 1]}
        />
      ))}
    </Canvas>
  )
}

export default Sequence3DViewer;