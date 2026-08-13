import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useMusic } from './MusicProvider'

function TerrainFallback({ playing }: { playing: boolean }) {
  return <div className={playing ? 'terrain-fallback is-playing' : 'terrain-fallback'} aria-hidden="true">
    {Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--bar': index } as React.CSSProperties} />)}
  </div>
}

export function AudioTerrain() {
  const mountRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [fallback, setFallback] = useState(false)
  const { analyser, playing } = useMusic()

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { analyserRef.current = analyser }, [analyser])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let animationFrame = 0
    let visible = !document.hidden
    let renderer: THREE.WebGLRenderer | null = null

    try {
      const mobile = window.innerWidth < 720
      const columns = mobile ? 42 : 74
      const rows = mobile ? 56 : 66
      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0x030708, mobile ? 0.042 : 0.036)

      const camera = new THREE.PerspectiveCamera(mobile ? 54 : 45, mount.clientWidth / mount.clientHeight, 0.1, 100)
      camera.position.set(mobile ? 0 : 1.5, mobile ? 10.6 : 10.8, mobile ? 15.5 : 17.5)
      camera.lookAt(0, 0, mobile ? -3.5 : -4.5)

      renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.35 : 1.7))
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      mount.appendChild(renderer.domElement)

      scene.add(new THREE.HemisphereLight(0x8afff3, 0x010303, 1.1))
      const cyanLight = new THREE.PointLight(0x3fffe9, 22, 32, 1.8)
      cyanLight.position.set(-2, 6, 2)
      scene.add(cyanLight)

      const geometry = new THREE.BoxGeometry(mobile ? 0.28 : 0.24, 1, mobile ? 0.28 : 0.24)
      geometry.translate(0, 0.5, 0)
      const material = new THREE.MeshStandardMaterial({
        color: 0x38d9ce,
        emissive: 0x062b2c,
        emissiveIntensity: 1.25,
        roughness: 0.43,
        metalness: 0.18,
        vertexColors: true,
      })
      const mesh = new THREE.InstancedMesh(geometry, material, columns * rows)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(mesh)

      const dummy = new THREE.Object3D()
      const color = new THREE.Color()
      const base = new THREE.Color(0x174d4e)
      const peak = new THREE.Color(0x8ffff2)
      const xGap = mobile ? 0.35 : 0.34
      const zGap = mobile ? 0.34 : 0.36
      const positions: Array<[number, number, number, number]> = []
      let instance = 0

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = (column - columns / 2) * xGap
          const z = (row - rows * 0.48) * zGap
          const radius = Math.sqrt(x * x + (z + 2.5) * (z + 2.5))
          positions.push([x, z, radius, (column * 0.67 + row * 0.33) / (columns + rows)])
          dummy.position.set(x, -0.5, z)
          dummy.scale.set(0.72, 0.08, 0.72)
          dummy.updateMatrix()
          mesh.setMatrixAt(instance, dummy.matrix)
          color.copy(base).lerp(peak, Math.max(0, 0.36 - radius / 50))
          mesh.setColorAt(instance, color)
          instance += 1
        }
      }
      mesh.instanceColor!.needsUpdate = true

      const startedAt = performance.now()
      let frequencyData = new Uint8Array(64)

      const draw = () => {
        animationFrame = requestAnimationFrame(draw)
        if (!visible || !renderer) return
        const time = (performance.now() - startedAt) / 1000
        const currentAnalyser = analyserRef.current
        if (currentAnalyser) {
          if (frequencyData.length !== currentAnalyser.frequencyBinCount) frequencyData = new Uint8Array(currentAnalyser.frequencyBinCount)
          currentAnalyser.getByteFrequencyData(frequencyData)
        } else frequencyData.fill(0)

        const isPlaying = playingRef.current
        let energy = 0
        for (let index = 0; index < Math.min(18, frequencyData.length); index += 1) energy += frequencyData[index]
        energy = energy / (Math.min(18, frequencyData.length) * 255 || 1)

        for (let index = 0; index < positions.length; index += 1) {
          const [x, z, radius, bandSeed] = positions[index]
          const band = Math.min(frequencyData.length - 1, Math.floor((0.08 + bandSeed * 0.72) * frequencyData.length))
          const frequency = frequencyData[band] / 255
          const centerPulse = Math.exp(-Math.pow(radius - (4.2 + Math.sin(time * 0.55) * 1.2), 2) / 5)
          const diagonal = Math.sin(x * 0.42 + z * 0.25 - time * 1.65) * 0.5 + 0.5
          const idle = 0.08 + (Math.sin(radius * 0.86 - time * 0.8) * 0.5 + 0.5) * 0.22
          const response = isPlaying ? frequency * 4.8 + energy * centerPulse * 5.5 + diagonal * energy * 1.7 : idle
          const height = Math.max(0.08, 0.13 + response)
          dummy.position.set(x, -0.78, z)
          dummy.scale.set(0.72, height, 0.72)
          dummy.rotation.y = 0
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
        mesh.rotation.y = Math.sin(time * 0.08) * 0.018
        cyanLight.intensity = 16 + energy * 30
        renderer.render(scene, camera)
      }

      const resize = () => {
        if (!renderer) return
        camera.aspect = mount.clientWidth / mount.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mount.clientWidth, mount.clientHeight)
      }
      const visibility = () => { visible = !document.hidden }
      window.addEventListener('resize', resize)
      document.addEventListener('visibilitychange', visibility)
      draw()

      return () => {
        cancelAnimationFrame(animationFrame)
        window.removeEventListener('resize', resize)
        document.removeEventListener('visibilitychange', visibility)
        geometry.dispose()
        material.dispose()
        renderer?.dispose()
        renderer?.domElement.remove()
      }
    } catch {
      setFallback(true)
      renderer?.dispose()
      return undefined
    }
  }, [])

  if (fallback) return <TerrainFallback playing={playing} />
  return <div className="audio-terrain" ref={mountRef} aria-hidden="true" />
}
