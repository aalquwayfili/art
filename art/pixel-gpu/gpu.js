import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function renderGpuSpin({ FRAMES = 24, FW = 84, FH = 60 } = {}) {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55
  const mat = (color, o = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o })
  const M = {
    shroud: mat('#e9e6d6', { roughness: 0.55 }),
    shroudDark: mat('#2b312c', { roughness: 0.5 }),
    accent: mat('#3b6a33', { roughness: 0.45 }),
    fanRim: mat('#232824', { roughness: 0.5 }),
    blade: mat('#1b201c', { roughness: 0.4 }),
    hub: mat('#e9e6d6', { roughness: 0.5 }),
    fin: mat('#c9ccc4', { roughness: 0.35, metalness: 0.6 }),
    pcb: mat('#1f3a26', { roughness: 0.7 }),
    back: mat('#7a8278', { roughness: 0.4, metalness: 0.35 }),
    gold: mat('#c9a24a', { roughness: 0.3, metalness: 0.9 }),
    bracket: mat('#b9bcb6', { roughness: 0.3, metalness: 0.85 }),
    port: mat('#141714', { roughness: 0.6 }),
    power: mat('#151815', { roughness: 0.6 }),
  }
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
  const card = new THREE.Group()

  const L = 26, H = 11, T = 4

  card.add(box(L, H, 0.25, M.back, 0, 0, -T / 2 + 0.12))
  card.add(box(L - 0.6, H - 0.4, 0.18, M.pcb, 0, -0.1, -T / 2 + 0.35))

  const finCount = 58
  for (let i = 0; i < finCount; i++) {
    const x = -L / 2 + 1.2 + (i * (L - 2.4)) / (finCount - 1)
    const fin = box(0.08, H - 1.4, T - 1.6, M.fin, x, 0, -0.05)
    fin.receiveShadow = false
    card.add(fin)
  }
  for (let k = 0; k < 3; k++) {
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(1.3 + k * 0.05, 0.16, 12, 32, Math.PI), mat('#b87333', { roughness: 0.3, metalness: 0.9 }))
    pipe.position.set(-2.2 + k * 1.1, H / 2 - 0.85, -0.2)
    pipe.rotation.y = Math.PI / 2
    pipe.castShadow = true
    card.add(pipe)
  }

  const sz = T / 2 - 0.35
  card.add(box(L, 1.3, 0.7, M.shroud, 0, H / 2 - 0.65, sz))
  card.add(box(L, 1.3, 0.7, M.shroud, 0, -H / 2 + 0.65, sz))
  card.add(box(1.6, H, 0.7, M.shroud, -L / 2 + 0.8, 0, sz))
  card.add(box(1.6, H, 0.7, M.shroud, L / 2 - 0.8, 0, sz))
  card.add(box(1.4, H - 2.6, 0.7, M.shroud, 0, 0, sz))
  card.add(box(L - 0.4, 0.14, 0.05, M.accent, 0, -H / 2 + 1.45, sz + 0.37))
  card.add(box(L, 0.5, 0.75, M.shroudDark, 0, H / 2 + 0.2, sz - 0.02))

  const fanR = 4.25
  for (const fx of [-L / 4 - 0.3, L / 4 + 0.3]) {
    const fan = new THREE.Group()
    const rim = new THREE.Mesh(new THREE.TorusGeometry(fanR, 0.22, 16, 64), M.fanRim)
    fan.add(rim)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.5, 48), M.hub)
    hub.rotation.x = Math.PI / 2
    hub.position.z = 0.1
    fan.add(hub)
    const blades = 11
    for (let b = 0; b < blades; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(fanR - 1.35, 1.35, 0.08), M.blade)
      blade.geometry.translate((fanR - 1.35) / 2 + 1.15, 0, 0)
      blade.rotation.z = (b / blades) * Math.PI * 2
      blade.rotateX(0.6)
      blade.castShadow = true
      fan.add(blade)
    }
    fan.position.set(fx, 0, sz - 0.05)
    card.add(fan)
  }

  for (let i = 0; i < 32; i++) card.add(box(0.14, 0.7, 0.05, M.gold, -3 + i * 0.26, -H / 2 - 0.3, -T / 2 + 0.47))
  card.add(box(8.8, 0.8, 0.16, M.pcb, -1.0, -H / 2 - 0.25, -T / 2 + 0.35))

  card.add(box(2.4, 0.9, 1.2, M.power, 6.5, H / 2 + 0.55, -0.9))

  const br = box(0.12, H + 1.6, T + 0.4, M.bracket, -L / 2 - 0.1, 0.3, 0)
  card.add(br)
  for (let i = 0; i < 3; i++) card.add(box(0.14, 0.7, 1.4, M.port, -L / 2 - 0.2, 3 - i * 1.6, 0.4))
  card.add(box(0.14, 0.8, 1.6, M.port, -L / 2 - 0.2, -2.2, 0.4))

  card.updateMatrixWorld(true)
  const bb = new THREE.Box3().setFromObject(card)
  card.position.sub(bb.getCenter(new THREE.Vector3()))
  const pivot = new THREE.Group()
  pivot.add(card)
  scene.add(pivot)

  scene.add(new THREE.HemisphereLight('#fffdf4', '#c9c4b0', 1.0))
  const key = new THREE.DirectionalLight('#ffffff', 2.4)
  key.position.set(-12, 20, 22)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 4
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 })
  scene.add(key)
  const rim = new THREE.DirectionalLight('#e8f3de', 0.9)
  rim.position.set(18, 6, -10)
  scene.add(rim)

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400)
  camera.position.set(0, 14, 41)
  camera.lookAt(0, -0.5, 0)
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const OUT = hex('#1b241c')
  const PAL = ['#2f3530', '#4a524a', '#7d857c', '#b3b8ae', '#d9d8cb', '#f2f0e2', '#3b6a33', '#b87333', '#d9a64a'].map(hex)
  const near = (r, g, b) => {
    let best = 0, bd = 1e9
    PAL.forEach((q, i) => { const d = (r - q[0]) ** 2 * 0.3 + (g - q[1]) ** 2 * 0.59 + (b - q[2]) ** 2 * 0.11; if (d < bd) { bd = d; best = i } })
    return best
  }
  function pixelate(src) {
    const c = document.createElement('canvas'); c.width = FW; c.height = FH
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(src, 0, 0, FW, FH)
    const d = x.getImageData(0, 0, FW, FH), p = d.data
    const idx = new Int16Array(FW * FH).fill(-1)
    for (let i = 0; i < FW * FH; i++) if (p[i * 4 + 3] >= 110) idx[i] = near(p[i * 4], p[i * 4 + 1], p[i * 4 + 2])
    for (let pass = 0; pass < 2; pass++) {
      const nxt = idx.slice()
      for (let y = 0; y < FH; y++) for (let i = 0; i < FW; i++) {
        const k = y * FW + i; if (idx[k] < 0) continue
        const cnt = {}; let same = false
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const X = i + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= FW || Y >= FH) continue
          const v = idx[Y * FW + X]; if (v < 0) continue
          if (v === idx[k]) same = true
          cnt[v] = (cnt[v] || 0) + 1
        }
        if (!same) { const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (top) nxt[k] = +top[0] }
      }
      idx.set(nxt)
    }
    for (let i = 0; i < FW * FH; i++) {
      if (idx[i] >= 0) { const q = PAL[idx[i]]; p[i * 4] = q[0]; p[i * 4 + 1] = q[1]; p[i * 4 + 2] = q[2]; p[i * 4 + 3] = 255 } else p[i * 4 + 3] = 0
    }
    for (let y = 0; y < FH; y++) for (let i = 0; i < FW; i++) {
      const k = y * FW + i; if (idx[k] >= 0) continue
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = i + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < FW && Y < FH && idx[Y * FW + X] >= 0 })) {
        p[k * 4] = OUT[0]; p[k * 4 + 1] = OUT[1]; p[k * 4 + 2] = OUT[2]; p[k * 4 + 3] = 255
      }
    }
    x.putImageData(d, 0, 0)
    return c
  }

  renderer.setSize(FW * 8, FH * 8, false)
  camera.aspect = FW / FH
  camera.updateProjectionMatrix()
  const strip = document.createElement('canvas')
  strip.width = FW * FRAMES; strip.height = FH
  const sx = strip.getContext('2d')
  for (let f = 0; f < FRAMES; f++) {
    pivot.rotation.y = (f / FRAMES) * Math.PI * 2 + 0.55
    renderer.render(scene, camera)
    sx.drawImage(pixelate(canvas), f * FW, 0)
  }
  return strip
}
