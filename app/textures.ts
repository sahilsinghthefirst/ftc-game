import * as THREE from 'three';

// Surface textures for the hall and the workshop, drawn once on small
// canvases at load time: nothing to download, and each is a single texture
// lookup at draw time. Everything is seeded, so the scenery looks the same on
// every load.

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function canvas(width: number, height = width) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return { element, ctx: element.getContext('2d')! };
}

function toTexture(
  element: HTMLCanvasElement,
  repeat: [number, number],
  color: boolean,
) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  // Colour maps are sRGB; bump and roughness maps are plain data.
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Speckle every pixel by up to +-amount, for grain that never looks tiled.
function grain(ctx: CanvasRenderingContext2D, amount: number, seed: number) {
  const random = seeded(seed);
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const shift = (random() - 0.5) * amount;
    image.data[i] += shift;
    image.data[i + 1] += shift;
    image.data[i + 2] += shift;
  }
  ctx.putImageData(image, 0, 0);
}

// Soft blotches of lighter and darker tone, like trowel marks in concrete.
function mottle(
  ctx: CanvasRenderingContext2D,
  count: number,
  strength: number,
  seed: number,
) {
  const random = seeded(seed);
  const { width, height } = ctx.canvas;
  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 20 + random() * width * 0.18;
    const light = random() > 0.5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const tone = light ? '255,255,255' : '0,0,0';
    gradient.addColorStop(0, `rgba(${tone},${strength * random()})`);
    gradient.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

// Sealed, polished concrete: mottled grey with fine aggregate and a saw-cut
// control joint round the edge of each slab. The roughness map makes the
// worn patches duller than the sealed ones, so the hall lights pool in it.
export function concreteFloor(slabs: number) {
  const size = 512;
  const color = canvas(size);
  color.ctx.fillStyle = '#8b9091';
  color.ctx.fillRect(0, 0, size, size);
  mottle(color.ctx, 70, 0.12, 3);
  grain(color.ctx, 18, 5);
  color.ctx.strokeStyle = 'rgba(40,44,46,0.3)';
  color.ctx.lineWidth = 3;
  color.ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

  const rough = canvas(size);
  rough.ctx.fillStyle = '#6e6e6e';
  rough.ctx.fillRect(0, 0, size, size);
  mottle(rough.ctx, 40, 0.3, 11);
  grain(rough.ctx, 20, 13);
  return {
    map: toTexture(color.element, [slabs, slabs], true),
    roughnessMap: toTexture(rough.element, [slabs, slabs], false),
  };
}

// Low-pile event carpet: a dark, faintly flecked weave.
export function eventCarpet(repeat: number) {
  const size = 256;
  const color = canvas(size);
  color.ctx.fillStyle = '#34393d';
  color.ctx.fillRect(0, 0, size, size);
  const random = seeded(17);
  for (let i = 0; i < 2600; i++) {
    const shade = 40 + Math.floor(random() * 40);
    color.ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 8})`;
    color.ctx.fillRect(random() * size, random() * size, 1.5, 1.5);
  }
  grain(color.ctx, 14, 19);
  const bump = canvas(size);
  bump.ctx.fillStyle = '#808080';
  bump.ctx.fillRect(0, 0, size, size);
  grain(bump.ctx, 90, 23);
  return {
    map: toTexture(color.element, [repeat, repeat], true),
    bumpMap: toTexture(bump.element, [repeat, repeat], false),
  };
}

// Painted concrete block: staggered courses, recessed mortar, and blocks
// that each take the paint a little differently.
export function blockWall(repeatX: number, repeatY: number) {
  const width = 512;
  const height = 256;
  const courses = 4;
  const perCourse = 4;
  const blockW = width / perCourse;
  const blockH = height / courses;
  const mortar = 5;
  const random = seeded(29);
  const color = canvas(width, height);
  const bump = canvas(width, height);
  color.ctx.fillStyle = '#50595e';
  color.ctx.fillRect(0, 0, width, height);
  bump.ctx.fillStyle = '#3a3a3a';
  bump.ctx.fillRect(0, 0, width, height);
  for (let row = 0; row < courses; row++) {
    const offset = row % 2 ? blockW / 2 : 0;
    for (let col = -1; col <= perCourse; col++) {
      const x = col * blockW + offset + mortar / 2;
      const y = row * blockH + mortar / 2;
      const tint = 0.92 + random() * 0.14;
      color.ctx.fillStyle = `rgb(${Math.round(98 * tint)},${Math.round(
        110 * tint,
      )},${Math.round(116 * tint)})`;
      color.ctx.fillRect(x, y, blockW - mortar, blockH - mortar);
      bump.ctx.fillStyle = '#c8c8c8';
      bump.ctx.fillRect(x, y, blockW - mortar, blockH - mortar);
    }
  }
  grain(color.ctx, 16, 31);
  grain(bump.ctx, 40, 37);
  return {
    map: toTexture(color.element, [repeatX, repeatY], true),
    bumpMap: toTexture(bump.element, [repeatX, repeatY], false),
  };
}

// Raised diamond tread plate, as a bump map over brushed metal.
export function treadPlate(repeat: number) {
  const size = 128;
  const bump = canvas(size);
  bump.ctx.fillStyle = '#707070';
  bump.ctx.fillRect(0, 0, size, size);
  bump.ctx.fillStyle = '#d8d8d8';
  const step = size / 4;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 5; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0);
      const y = row * (step / 2);
      bump.ctx.save();
      bump.ctx.translate(x, y);
      bump.ctx.rotate(row % 2 ? Math.PI / 4 : -Math.PI / 4);
      bump.ctx.fillRect(-step * 0.32, -2.5, step * 0.64, 5);
      bump.ctx.restore();
    }
  return { bumpMap: toTexture(bump.element, [repeat, repeat], false) };
}

// Ribbed aluminum bleacher plank: fine ridges running along its length.
export function ribbedPlank(repeat: number) {
  const size = 128;
  const bump = canvas(size);
  for (let y = 0; y < size; y++) {
    const ridge = Math.sin((y / size) * Math.PI * 2 * 10) * 0.5 + 0.5;
    const shade = Math.round(90 + ridge * 120);
    bump.ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bump.ctx.fillRect(0, y, size, 1);
  }
  return { bumpMap: toTexture(bump.element, [repeat, 1], false) };
}

// Perforated hardboard pegboard: a regular grid of holes on a warm board.
export function pegboard(repeatX: number, repeatY: number) {
  const size = 128;
  const color = canvas(size);
  color.ctx.fillStyle = '#9c8a6e';
  color.ctx.fillRect(0, 0, size, size);
  grain(color.ctx, 22, 41);
  const bump = canvas(size);
  bump.ctx.fillStyle = '#b0b0b0';
  bump.ctx.fillRect(0, 0, size, size);
  const step = size / 4;
  for (let y = step / 2; y < size; y += step)
    for (let x = step / 2; x < size; x += step) {
      color.ctx.fillStyle = '#2b251d';
      color.ctx.beginPath();
      color.ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      color.ctx.fill();
      bump.ctx.fillStyle = '#202020';
      bump.ctx.beginPath();
      bump.ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      bump.ctx.fill();
    }
  return {
    map: toTexture(color.element, [repeatX, repeatY], true),
    bumpMap: toTexture(bump.element, [repeatX, repeatY], false),
  };
}

// Anti-static work mat, as on a real team's build bench: blue-grey rubber
// with a fine centimetre grid, heavier lines every five, and a ruler along
// two edges.
export function workMat() {
  const size = 1024;
  const { element, ctx } = canvas(size);
  ctx.fillStyle = '#2f5566';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, 10, 43);
  const cells = 40;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const major = i % 5 === 0;
    ctx.strokeStyle = major
      ? 'rgba(210,232,240,0.2)'
      : 'rgba(210,232,240,0.06)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  // Ruler ticks and a white border strip along the near and left edges.
  ctx.fillStyle = 'rgba(236,244,246,0.8)';
  ctx.fillRect(0, size - 26, size, 26);
  ctx.fillRect(0, 0, 26, size);
  ctx.fillStyle = '#2f5566';
  for (let i = 0; i <= cells; i++) {
    const long = i % 5 === 0 ? 18 : 9;
    ctx.fillRect(i * step - 1, size - long, 2, long);
    ctx.fillRect(0, i * step - 1, long, 2);
  }
  const texture = toTexture(element, [1, 1], true);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return { map: texture };
}
