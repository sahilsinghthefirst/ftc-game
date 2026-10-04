'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Layers3, RotateCcw, Camera } from 'lucide-react';
import type { AssemblyCategory } from './assembly-bay';
import {
  createRobotModel,
  updateRobotModel,
  animateRobotMechanisms,
  robotScorerPosition,
  disposeObject,
  type RobotModel,
} from './robot-model';
import { mergeStaticMeshes } from './merge-static';
import { createRenderPipeline } from './render-pipeline';
import { setupScene, workshopRoom, ring } from './scene-kit';

type Props = {
  selected: Record<AssemblyCategory, string>;
  activeCategory: AssemblyCategory;
  draggingCategory: AssemblyCategory | null;
  snappingCategory: AssemblyCategory | null;
  onSelectCategory?: (category: AssemblyCategory) => void;
};
const offsets: Record<AssemblyCategory, THREE.Vector3> = {
  drive: new THREE.Vector3(0, 0, 0),
  collect: new THREE.Vector3(0, 0.4, 2.8),
  carry: new THREE.Vector3(-2, 2.2, 0),
  reach: new THREE.Vector3(1.8, 1.5, -1.8),
  score: new THREE.Vector3(1.8, 3.4, -1.8),
  assist: new THREE.Vector3(-2, 1.4, 1.2),
};
export function Robot3DBay(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<RobotModel | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraMoveRef = useRef<{
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
  } | null>(null);
  const reducedMotionRef = useRef(false);
  // Asks the workshop view for a fresh frame (it only draws on change).
  const invalidateRef = useRef<() => void>(() => {});
  const propsRef = useRef(props);
  const modeRef = useRef(false);
  const [exploded, setExploded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('Perspective');
  const [hint, setHint] = useState(
    'Drag to orbit · scroll to zoom · click a mechanism',
  );
  useEffect(() => {
    propsRef.current = props;
  }, [props]);
  useEffect(() => {
    modeRef.current = exploded;
  }, [exploded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let kit: ReturnType<typeof setupScene>;
    try {
      kit = setupScene(canvas, 0x18252e);
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    const { scene, renderer, environment, key } = kit;
    // A closer inspection camera and a studio-like key reveal the machined
    // edges; the arena keeps its existing field lighting.
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.updateProjectionMatrix();
    key.intensity = 2.4;
    renderer.toneMappingExposure = 1.02;
    sceneRef.current = scene;
    // The pit never moves, so its many small parts are fused into a few meshes.
    const room = new THREE.Group();
    workshopRoom(room);
    mergeStaticMeshes(room, []);
    scene.add(room);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const pipeline = createRenderPipeline(renderer, scene, camera, () =>
      invalidateRef.current(),
    );
    camera.position.set(8.3, 6.6, 10);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 2, 0.2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 7;
    controls.maxDistance = 25;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = 1.45;
    // Swing no further than a little past side-on: any further round and a
    // zoomed-out camera ends up behind the pit's back wall. At the limit and
    // full zoom it is still well in front of it.
    controls.minAzimuthAngle = -1.75;
    controls.maxAzimuthAngle = 1.75;
    controls.enablePan = false;
    controlsRef.current = controls;
    // The workshop only redraws when something on screen changes: the camera
    // moves, a part snaps or slides, the selection changes, or the view is
    // resized. Sitting on the build screen then costs a school laptop's
    // graphics chip nothing at all.
    let dirty = true;
    const invalidate = () => {
      dirty = true;
    };
    invalidateRef.current = invalidate;
    controls.addEventListener('change', invalidate);
    const cancelCameraMove = () => {
      cameraMoveRef.current = null;
    };
    controls.addEventListener('start', cancelCameraMove);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => {
      reducedMotionRef.current = motion.matches;
      invalidate();
    };
    motionChanged();
    motion.addEventListener('change', motionChanged);
    const marker = ring(0.55, 0xf2bc42, 0.04);
    scene.add(marker);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerStart = new THREE.Vector2();
    const down = (event: PointerEvent) => {
      pointerStart.set(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      if (
        pointerStart.distanceTo(
          new THREE.Vector2(event.clientX, event.clientY),
        ) > 6
      )
        return;
      const model = modelRef.current;
      if (!model) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(model.root.children, true)
        .find((h) => h.object.userData.category);
      if (hit)
        propsRef.current.onSelectCategory?.(hit.object.userData.category);
      canvas.focus({ preventScroll: true });
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          '+',
          '-',
          '=',
          'Home',
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === 'Home') {
        camera.position.set(8.3, 6.6, 10);
        controls.target.set(0, 2, 0.2);
        controls.update();
        return;
      }
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= 0.15;
      if (event.key === 'ArrowRight') spherical.theta += 0.15;
      if (event.key === 'ArrowUp')
        spherical.phi = Math.max(0.15, spherical.phi - 0.1);
      if (event.key === 'ArrowDown')
        spherical.phi = Math.min(1.4, spherical.phi + 0.1);
      if (event.key === '+' || event.key === '=')
        spherical.radius = Math.max(7, spherical.radius * 0.9);
      if (event.key === '-')
        spherical.radius = Math.min(25, spherical.radius * 1.1);
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('keydown', keydown);
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      pipeline.setSize(rect.width, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);
    resize();
    let frame = 0,
      previous = performance.now(),
      elapsed = 0;
    // What the marker last showed, so a change of selection redraws.
    let shownActive: string | null = null;
    let shownDragging = false;
    let shownExploded = false;
    const goal = new THREE.Vector3();
    const bounds = new THREE.Box3();
    const center = new THREE.Vector3();
    const loop = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (document.visibilityState === 'hidden') {
        frame = requestAnimationFrame(loop);
        return;
      }
      elapsed += dt;
      const model = modelRef.current;
      const current = propsRef.current;
      const cameraMove = cameraMoveRef.current;
      if (cameraMove) {
        const t = motion.matches
          ? 1
          : Math.min(1, (now - cameraMove.start) / 700);
        const ease = t * t * (3 - 2 * t);
        camera.position.lerpVectors(cameraMove.from, cameraMove.to, ease);
        controls.target.lerpVectors(
          cameraMove.targetFrom,
          cameraMove.targetTo,
          ease,
        );
        if (t === 1) cameraMoveRef.current = null;
        dirty = true;
      }
      if (model) {
        const explodedNow = modeRef.current;
        if (motion.matches && (model.activity || model.elevation))
          animateRobotMechanisms(model, 1, 0, 0);
        let moved = false;
        let testing = 0,
          extension = 0;
        for (const [key, group] of Object.entries(model.groups)) {
          const category = key as AssemblyCategory;
          goal.copy(group.userData.home as THREE.Vector3);
          if (category === 'score') robotScorerPosition(model, goal);
          if (explodedNow) goal.add(offsets[category]);
          const install = group.userData.installStarted as number | undefined;
          if (install !== undefined) {
            const t = motion.matches ? 1 : Math.min(1, (now - install) / 1050);
            // Approach, align, then gently seat the assembly on its mount.
            const ease = 1 - (1 - t) ** 3;
            const origin = group.userData.installOffset as THREE.Vector3;
            goal.addScaledVector(origin, 1 - ease);
            group.rotation.z = Math.sin(t * Math.PI) * (1 - t) * 0.13;
            if (t >= 1) {
              delete group.userData.installStarted;
              group.rotation.z = 0;
            }
            moved = true;
          }
          const test = group.userData.testStarted as number | undefined;
          if (test !== undefined && !motion.matches && !explodedNow) {
            const t = (now - test) / 2200;
            if (t > 1) delete group.userData.testStarted;
            else if (t > 0) {
              const pulse = Math.sin(Math.min(1, t) * Math.PI) ** 2;
              if (category === 'collect' || category === 'score')
                testing = Math.max(testing, pulse);
              if (category === 'reach' || category === 'score')
                extension = Math.max(extension, pulse);
              if (category === 'drive')
                model.moving.wheels.forEach((wheel) =>
                  wheel.rotateX(dt * pulse * 1.6),
                );
              moved = true;
            }
          }
          if (group.position.distanceToSquared(goal) < 1e-8) continue;
          group.position.lerp(
            goal,
            motion.matches ? 1 : 1 - Math.exp(-12 * dt),
          );
          moved = true;
        }
        if (
          !motion.matches &&
          (moved || model.activity > 0.001 || model.elevation > 0.001)
        ) {
          animateRobotMechanisms(model, dt, testing, extension);
          moved = true;
        }
        const dragging = Boolean(current.draggingCategory);
        if (
          moved ||
          current.activeCategory !== shownActive ||
          dragging !== shownDragging ||
          explodedNow !== shownExploded
        ) {
          shownActive = current.activeCategory;
          shownDragging = dragging;
          shownExploded = explodedNow;
          bounds.setFromObject(model.groups[current.activeCategory]);
          bounds.getCenter(center);
          marker.position.set(
            center.x,
            Math.max(0.06, bounds.min.y - 0.04),
            center.z,
          );
          marker.scale.setScalar(dragging ? 1.5 : 1);
          marker.visible = !explodedNow;
          dirty = true;
        }
      }
      // Damping keeps the camera gliding after a drag; that fires 'change'.
      controls.update();
      if (dirty) {
        dirty = false;
        pipeline.render();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.removeEventListener('start', cancelCameraMove);
      motion.removeEventListener('change', motionChanged);
      controls.dispose();
      invalidateRef.current = () => {};
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('keydown', keydown);
      disposeObject(scene);
      environment.dispose();
      pipeline.dispose();
      renderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let model = modelRef.current;
    let changed: AssemblyCategory[];
    if (model) changed = updateRobotModel(model, props.selected);
    else {
      model = createRobotModel(props.selected);
      scene.add(model.root);
      modelRef.current = model;
      changed = ['drive', 'collect', 'reach'];
    }
    if (changed.includes('reach') && !changed.includes('score'))
      changed.push('score');
    if (!reducedMotionRef.current)
      for (const category of changed) {
        const group = model.groups[category];
        const now = performance.now();
        const offset = offsets[category].clone().multiplyScalar(0.6);
        offset.y = category === 'drive' ? 0.48 : Math.max(0.55, offset.y);
        group.userData.installStarted = now;
        group.userData.installOffset = offset;
        group.userData.testStarted = now + 1050;
        group.position.copy(group.userData.home).add(offset);
      }
    invalidateRef.current();
  }, [props.selected]);

  const setCamera = (mode: string) => {
    const camera = cameraRef.current,
      controls = controlsRef.current;
    if (!camera || !controls) return;
    const position =
      mode === 'Top'
        ? new THREE.Vector3(0, exploded ? 24 : 17, 0.2)
        : mode === 'Front'
          ? new THREE.Vector3(0, exploded ? 5.2 : 3.8, exploded ? 23 : 13)
          : exploded
            ? new THREE.Vector3(13, 11, 16)
            : new THREE.Vector3(8.3, 6.6, 10);
    moveCamera(position, new THREE.Vector3(0, exploded ? 3.4 : 2, 0.2));
    setView(mode);
  };
  const moveCamera = (position: THREE.Vector3, target: THREE.Vector3) => {
    const camera = cameraRef.current,
      controls = controlsRef.current;
    if (!camera || !controls) return;
    if (reducedMotionRef.current) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
    } else
      cameraMoveRef.current = {
        start: performance.now(),
        from: camera.position.clone(),
        to: position,
        targetFrom: controls.target.clone(),
        targetTo: target,
      };
    invalidateRef.current();
  };
  return (
    <div
      className={
        'robot-3d-shell immersive-bay ' +
        (props.draggingCategory ? 'is-dragging' : '')
      }
    >
      <div className="robot-3d-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="robot-webgl-canvas"
          tabIndex={0}
          aria-label="3D robot workshop. Drag to orbit, arrow keys to rotate, plus and minus to zoom. Click a robot mechanism to select it."
        />
        {failed && (
          <div className="three-fallback">
            <strong>The 3D scene could not start.</strong>
            <span>
              Enable hardware acceleration or use a browser with WebGL support.
            </span>
          </div>
        )}
      </div>
      <div className="scene-toolbar" aria-label="3D workshop controls">
        <button
          onClick={() => {
            setExploded((v) => !v);
            moveCamera(
              exploded
                ? new THREE.Vector3(8.3, 6.6, 10)
                : new THREE.Vector3(13, 11, 16),
              new THREE.Vector3(0, exploded ? 2 : 3.4, 0.2),
            );
            setView('Perspective');
            setHint(
              exploded
                ? 'Click a mechanism to inspect it'
                : 'See how the six subsystems fit together',
            );
          }}
          aria-pressed={exploded}
        >
          <Layers3 size={17} />
          {exploded ? 'Assembled view' : 'Separate parts'}
        </button>
        <button
          aria-label={`Change camera view. Current view: ${view}`}
          onClick={() =>
            setCamera(
              view === 'Perspective'
                ? 'Top'
                : view === 'Top'
                  ? 'Front'
                  : 'Perspective',
            )
          }
        >
          <Camera size={17} />
          {view === 'Perspective' ? 'Angle' : view}
        </button>
        <button
          aria-label="Reset camera"
          onClick={() => setCamera('Perspective')}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="scene-instructions">
        <Box size={15} />
        {hint}
      </div>
    </div>
  );
}
