import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'
import type { BaseProps } from '../types/index'

const Base3D: React.FC<BaseProps> = ({ position, color, nextPos }) => {
  const mesh = useRef<THREE.Mesh>(null!)
  const connector = useRef<THREE.Mesh>(null!)

  useEffect(() => {
    if (nextPos && connector.current) {
      const start = new THREE.Vector3(...position)
      const end = new THREE.Vector3(...nextPos)
      const mid = start.clone().add(end).multiplyScalar(0.5)
      const dir = end.clone().sub(start)
      const len = dir.length()
      const axis = new THREE.Vector3(0, 1, 0)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        axis.normalize(),
        dir.clone().normalize()
      )

      connector.current.position.copy(mid)
      connector.current.setRotationFromQuaternion(quaternion)
      connector.current.scale.set(1, len, 1)
    }
  }, [position, nextPos])

  return (
    <group>
      <mesh ref={mesh} position={position}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {nextPos && (
        <mesh ref={connector}>
          <cylinderGeometry args={[0.05, 0.05, 1, 16]} />
          <meshStandardMaterial color={0x888888} />
        </mesh>
      )}
    </group>
  )
}

export default Base3D;