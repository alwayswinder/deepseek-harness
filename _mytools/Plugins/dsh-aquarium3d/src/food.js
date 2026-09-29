/**
 * Fish food: the pellets a click on the water puts in, and what happens to them.
 *
 * A pellet falls from the surface, drifts a little as it sinks, and settles on
 * the sand. The school looks at this list every frame and eats what it reaches;
 * the pellet then reports itself eaten and its slot goes back to the pool.
 */
import * as THREE from '../vendor/three.module.js'

/** How many pellets can exist at once. */
const POOL = 24

/** One pellet: a mesh plus where it is and whether it is still food. */
class Pellet {
  constructor(mesh) {
    this.mesh = mesh
    this.x = 0
    this.y = 0
    this.z = 0
    this.vy = 0
    this.age = 0
    this.eaten = true
    this.active = false
  }
}

/** The food pool and its simple physics. */
export class Food {
  /**
   * @param options - the water level, the terrain height function, and the tank half extents.
   */
  constructor(options) {
    this.waterY = options.waterY
    this.terrainHeight = options.terrainHeight
    this.bounds = options.bounds
    this.group = new THREE.Group()
    this.group.name = 'food'
    const geometry = new THREE.SphereGeometry(0.011, 8, 6)
    const material = new THREE.MeshStandardMaterial({ color: 0xb07a3a, roughness: 0.85 })
    this.pellets = []
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.pellets.push(new Pellet(mesh))
    }
    /** Set by the stage so an eaten pellet can also say so on the surface. */
    this.onEat = null
  }

  /**
   * Drop pellets at one point on the surface.
   * @param x - world X of the drop.
   * @param z - world Z of the drop.
   * @param count - how many pellets to drop.
   * @returns the pellets that were actually created.
   */
  drop(x, z, count = 3) {
    const created = []
    for (let i = 0; i < count; i++) {
      const pellet = this.pellets.find((entry) => !entry.active)
      if (pellet === undefined) break
      pellet.active = true
      pellet.eaten = false
      pellet.age = 0
      pellet.x = THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 0.16, -this.bounds.hx + 0.04, this.bounds.hx - 0.04)
      pellet.z = THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 0.16, -this.bounds.hz + 0.04, this.bounds.hz - 0.04)
      pellet.y = this.waterY - 0.012
      pellet.vy = -0.035
      pellet.mesh.visible = true
      pellet.mesh.position.set(pellet.x, pellet.y, pellet.z)
      created.push(pellet)
    }
    return created
  }

  /**
   * Sink, settle, and retire the pellets.
   * @param dt - seconds since the last frame.
   */
  update(dt) {
    for (const pellet of this.pellets) {
      if (!pellet.active) continue
      if (pellet.eaten) {
        pellet.active = false
        pellet.mesh.visible = false
        this.onEat?.(pellet)
        continue
      }
      pellet.age += dt
      const floor = this.terrainHeight(pellet.x, pellet.z) + 0.012
      if (pellet.y > floor) {
        pellet.vy = Math.max(pellet.vy - dt * 0.02, -0.075)
        pellet.y += pellet.vy * dt
        pellet.x += Math.sin(pellet.age * 3.1) * dt * 0.012
        pellet.z += Math.cos(pellet.age * 2.4) * dt * 0.010
      } else {
        pellet.y = floor
        pellet.vy = 0
      }
      // Uneaten food stops being food after a while, so it never piles up.
      if (pellet.age > 45) {
        pellet.active = false
        pellet.mesh.visible = false
      }
      pellet.mesh.position.set(pellet.x, pellet.y, pellet.z)
      pellet.mesh.rotation.x += dt * 1.2
      pellet.mesh.rotation.y += dt * 0.8
    }
  }

  /** How many pellets are in the water right now. */
  get liveCount() {
    return this.pellets.filter((pellet) => pellet.active && !pellet.eaten).length
  }

  /** Release the shared geometry and material. */
  dispose() {
    this.group.children[0]?.geometry.dispose()
    for (const pellet of this.pellets) void pellet
    this.group.children.forEach((mesh) => {
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material.dispose()
    })
  }
}
