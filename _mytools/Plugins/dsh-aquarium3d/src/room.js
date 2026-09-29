/**
 * The room around the tank.
 *
 * A closed box: wood floor, warm walls, a ceiling, and two pendant hoods that
 * are the only real light sources. The hoods matter more than the walls — the
 * tank's shadows, its glass highlights, and the water's specular streak all
 * come from them, so the scene keeps one shadow map and two unshadowed spots
 * rather than a full lighting rig.
 */
import * as THREE from '../vendor/three.module.js'
import { TANK } from './tank.js'

/** Lamp hood geometry: two units, given by their center X and a shared line. */
const LAMPS = [
  { x: -0.62, z: 0.30 },
  { x: 0.62, z: 0.30 },
]

/** Where the hood light sampling point sits for the water and caustics. */
export const HOOD_POINT = new THREE.Vector3(0.62, 2.02, 0.30)

/**
 * Build the room, its lamps, and its light rig.
 * @param scene - the scene the room is added to.
 * @returns the lights the frame loop drives, plus the group added to the scene.
 */
export function buildRoom(scene) {
  const group = new THREE.Group()
  group.name = 'room'

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2c1d, roughness: 0.72 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), floorMaterial)
  floor.position.y = TANK.standBottom
  floor.receiveShadow = true
  group.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.95 })
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x4f4a42, roughness: 0.95 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), wallMaterial)
  back.position.set(0, 2.5, -4.6)
  group.add(back)
  const left = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), wallMaterial)
  left.position.set(-6.4, 2.5, 0)
  left.rotation.y = Math.PI / 2
  group.add(left)
  const right = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), wallMaterial)
  right.position.set(6.4, 2.5, 0)
  right.rotation.y = -Math.PI / 2
  group.add(right)
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(Math.PI / 2), ceilingMaterial)
  ceiling.position.y = 3.9
  group.add(ceiling)

  const hoodBody = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.35 })
  const hoodGlow = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, emissive: 0xfff2dc, emissiveIntensity: 1.6 })

  const spots = []
  for (const lamp of LAMPS) {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.34), hoodGlow).translateX(lamp.x).translateY(2.06).translateZ(lamp.z))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.10, 0.40), hoodBody).translateX(lamp.x).translateY(2.14).translateZ(lamp.z))
  }

  const spotOf = (lamp) => {
    const spot = new THREE.SpotLight(0xfff0d6, 13, 12, 0.95, 0.75, 1.9)
    spot.position.set(lamp.x, 2.05, lamp.z)
    spot.target.position.set(lamp.x * 0.4, TANK.standBottom, lamp.z * 0.6)
    group.add(spot)
    group.add(spot.target)
    spots.push(spot)
    return spot
  }
  LAMPS.forEach(spotOf)

  // The hood light: the only shadow caster, aimed straight down into the tank.
  const hood = new THREE.DirectionalLight(0xfff1dd, 2.8)
  hood.position.set(0.72, 3.1, 0.85)
  hood.target.position.set(0, TANK.base, 0)
  hood.castShadow = true
  hood.shadow.mapSize.set(2048, 2048)
  hood.shadow.camera.left = -2.6
  hood.shadow.camera.right = 2.6
  hood.shadow.camera.top = 2.4
  hood.shadow.camera.bottom = -2.4
  hood.shadow.camera.near = 0.6
  hood.shadow.camera.far = 9
  hood.shadow.bias = -0.0006
  hood.shadow.normalBias = 0.012
  hood.shadow.camera.updateProjectionMatrix()
  group.add(hood)
  group.add(hood.target)

  const hemi = new THREE.HemisphereLight(0xbcd8e6, 0x4a3a2c, 0.20)
  const fill = new THREE.DirectionalLight(0xcfe4ea, 0.14)
  fill.position.set(-2.2, 1.6, 1.8)
  scene.add(hemi)
  scene.add(fill)
  scene.add(group)

  return { group, hood, hemi, fill, spots }
}
