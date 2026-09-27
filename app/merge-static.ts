import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Every mesh is a separate draw call, and on the integrated graphics in a
// typical school laptop it is the number of draw calls - not triangles - that
// limits the frame rate. The robots and the hall are built from hundreds of
// small parts that never move relative to each other, so this fuses them:
// the meshes under one "container" become as few meshes as possible.
//
// Containers are the nodes that move on their own (a wheel, a lift, a part
// group that explodes apart in the workshop). Nothing is merged across a
// container boundary, so every animation keeps working exactly as before.
//
// Plain untextured parts fuse whatever their finish: each part's colour,
// roughness and metalness move into its vertices, and one shared material
// reads them back, so a wheel's rubber tyre, metal hub and plastic rollers
// still look exactly as they did - in one draw instead of five.

// Plain = a standard material with no textures, whose look is fully
// described by colour, roughness and metalness.
function plain(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial;
  return (
    m.type === 'MeshStandardMaterial' &&
    !m.map &&
    !m.roughnessMap &&
    !m.metalnessMap &&
    !m.normalMap &&
    !m.bumpMap &&
    !m.emissiveMap &&
    !m.vertexColors
  );
}

// Materials with the same key draw identically once the per-vertex values
// (for plain ones) are applied.
function materialKey(material: THREE.Material) {
  const m = material as THREE.MeshPhysicalMaterial;
  const texture = (value: THREE.Texture | null | undefined) =>
    value ? value.uuid : '-';
  const shared = [
    m.type,
    m.emissive?.getHexString(),
    m.emissiveIntensity,
    m.opacity,
    m.transparent,
    m.side,
    m.depthWrite,
    m.toneMapped,
    m.flatShading,
    m.wireframe,
    m.alphaTest,
    m.envMapIntensity,
  ];
  if (plain(material)) return [...shared, 'plain'].join('|');
  return [
    ...shared,
    m.color?.getHexString(),
    m.roughness,
    m.metalness,
    m.vertexColors,
    m.clearcoat,
    m.clearcoatRoughness,
    texture(m.map),
    texture(m.normalMap),
    texture(m.bumpMap),
    texture(m.roughnessMap),
    m.bumpScale,
  ].join('|');
}

// Teach a standard material to take roughness and metalness from a vertex
// attribute instead of its own two numbers.
function surfaceFromVertices(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 surface;\nvarying vec2 vSurface;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSurface = surface;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurface;')
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = vSurface.x;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        'float metalnessFactor = vSurface.y;',
      );
  };
  material.customProgramCacheKey = () => 'surface-from-vertices';
}

type Candidate = { mesh: THREE.Mesh; container: THREE.Object3D };

function mergeable(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh)
    return false;
  if (Array.isArray(mesh.material) || mesh.userData.keepSeparate) return false;
  const geometry = mesh.geometry;
  return Boolean(geometry.attributes.position && geometry.attributes.normal);
}

// Bake a mesh's transform (and, for plain parts, its finish) into a copy of
// its geometry, with only the attributes the whole batch shares.
function prepare(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  withUv: boolean,
  finish: THREE.MeshStandardMaterial | null,
) {
  const copy = new THREE.BufferGeometry();
  copy.setAttribute('position', geometry.attributes.position.clone());
  copy.setAttribute('normal', geometry.attributes.normal.clone());
  if (withUv) copy.setAttribute('uv', geometry.attributes.uv.clone());
  // Colours the geometry already carries travel with it.
  if (!finish && geometry.attributes.color)
    copy.setAttribute('color', geometry.attributes.color.clone());
  if (geometry.index) copy.setIndex(geometry.index.clone());
  copy.applyMatrix4(matrix);
  const flat = copy.index ? copy.toNonIndexed() : copy;
  if (finish) {
    const count = flat.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const surface = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = finish.color.r;
      colors[i * 3 + 1] = finish.color.g;
      colors[i * 3 + 2] = finish.color.b;
      surface[i * 2] = finish.roughness;
      surface[i * 2 + 1] = finish.metalness;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.setAttribute('surface', new THREE.BufferAttribute(surface, 2));
  }
  return flat;
}

export function mergeStaticMeshes(
  root: THREE.Object3D,
  containers: Iterable<THREE.Object3D>,
) {
  const boundaries = new Set<THREE.Object3D>(containers);
  boundaries.add(root);
  root.updateMatrixWorld(true);

  const candidates: Candidate[] = [];
  root.traverse((object) => {
    // A boundary that is itself a mesh (a spinning roller) moves on its own.
    if (boundaries.has(object) || !mergeable(object)) return;
    let container = object.parent;
    while (container && !boundaries.has(container))
      container = container.parent;
    if (container) candidates.push({ mesh: object, container });
  });

  // Batch by container, look, and shadow behaviour.
  const batches = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const { mesh, container } = candidate;
    const key = [
      container.uuid,
      materialKey(mesh.material as THREE.Material),
      mesh.castShadow,
      mesh.receiveShadow,
      mesh.userData.category ?? '',
    ].join('#');
    const batch = batches.get(key);
    if (batch) batch.push(candidate);
    else batches.set(key, [candidate]);
  }

  const inverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();
  const spent = new Set<THREE.BufferGeometry>();
  let merged = 0;
  for (const batch of batches.values()) {
    if (batch.length < 2) continue;
    const { container } = batch[0];
    inverse.copy(container.matrixWorld).invert();
    const first = batch[0].mesh;
    const firstMaterial = first.material as THREE.Material;
    const baked = plain(firstMaterial);
    const withUv = batch.every(({ mesh }) => mesh.geometry.attributes.uv);
    const parts = batch.map(({ mesh }) =>
      prepare(
        mesh.geometry,
        relative.multiplyMatrices(inverse, mesh.matrixWorld),
        withUv,
        baked ? (mesh.material as THREE.MeshStandardMaterial) : null,
      ),
    );
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    let material = firstMaterial;
    if (baked) {
      const fromVertices = firstMaterial.clone() as THREE.MeshStandardMaterial;
      fromVertices.color.set(0xffffff);
      fromVertices.vertexColors = true;
      surfaceFromVertices(fromVertices);
      material = fromVertices;
    }
    const fused = new THREE.Mesh(geometry, material);
    fused.castShadow = first.castShadow;
    fused.receiveShadow = first.receiveShadow;
    fused.userData.category = first.userData.category;
    fused.name = 'merged';
    container.add(fused);
    for (const { mesh } of batch) {
      mesh.removeFromParent();
      spent.add(mesh.geometry);
      if (mesh.material !== material)
        (mesh.material as THREE.Material).dispose();
    }
    merged += batch.length;
  }

  // Free the source geometry, unless something still on screen uses it.
  const inUse = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) inUse.add(mesh.geometry);
  });
  spent.forEach((geometry) => {
    if (!inUse.has(geometry)) geometry.dispose();
  });
  return merged;
}
