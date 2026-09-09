'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Layers3, RotateCcw, Scan, Camera } from 'lucide-react';
import type { AssemblyCategory } from './assembly-bay';
import {
  createRobotModel,
  disposeObject,
  type RobotModel,
} from './robot-model';
import { setupScene, workshopRoom, ring } from './scene-kit';

type Props = {
  selected: Record<AssemblyCategory, string>;
  activeCategory: AssemblyCategory;
  draggingCategory: AssemblyCategory | null;
  snappingCategory: AssemblyCategory | null;
  mountSlots: Record<AssemblyCategory, number>;
  mechanismRunning: boolean;
  onSelectCategory?: (category: AssemblyCategory) => void;
};
const names: Record<AssemblyCategory, string> = {
  drive: 'Drivetrain',
  collect: 'Intake',
  carry: 'Storage',
  reach: 'Lift',
  score: 'Scoring tool',
  assist: 'Sensors',
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
    const { scene, renderer, environment } = kit;
    sceneRef.current = scene;
    workshopRoom(scene);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(10.5, 7.5, 12.5);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.6, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 7;
    controls.maxDistance = 25;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = 1.45;
    controls.enablePan = false;
    controlsRef.current = controls;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
        camera.position.set(10.5, 7.5, 12.5);
        controls.target.set(0, 1.6, 0);
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
      renderer.setSize(
        Math.max(1, rect.width),
        Math.max(1, rect.height),
        false,
      );
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);
    resize();
    let frame = 0,
      previous = performance.now(),
      elapsed = 0;
    let snapCategory: string | null = null,
      snapTime = 0;
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
      if (model) {
        const explodedNow = modeRef.current;
        if (current.snappingCategory !== snapCategory) {
          snapCategory = current.snappingCategory;
          snapTime = elapsed;
        }
        for (const [key, group] of Object.entries(model.groups)) {
          const category = key as AssemblyCategory;
          const home = group.userData.home as THREE.Vector3;
          const target = home.clone();
          if (explodedNow) target.add(offsets[category]);
          if (snapCategory === key && !explodedNow && !motion.matches)
            target.y += Math.max(0, 1 - (elapsed - snapTime) / 0.6) ** 2 * 3;
          group.position.lerp(
            target,
            motion.matches ? 1 : 1 - Math.exp(-12 * dt),
          );
        }
        const running =
          current.mechanismRunning && !motion.matches && !explodedNow;
        if (running)
          model.moving.wheels.forEach((w) => {
            w.rotation.x += dt * 4;
          });
        const liftAmount = running ? (Math.sin(elapsed * 3.8) + 1) * 0.35 : 0;
        if (model.moving.lift) {
          const lift = model.moving.lift;
          const rest = Number(lift.userData.restY ?? 0);
          lift.position.y = THREE.MathUtils.damp(
            lift.position.y,
            rest + liftAmount,
            14,
            dt,
          );
        }
        if (running)
          model.groups.score.position.y =
            (model.groups.score.userData.home as THREE.Vector3).y + liftAmount;
        if (model.moving.intake)
          model.moving.intake.rotation.x = running
            ? Math.sin(elapsed * 12) * 0.07
            : 0;
        const active = model.groups[current.activeCategory];
        const bounds = new THREE.Box3().setFromObject(active);
        const center = bounds.getCenter(new THREE.Vector3());
        marker.position.set(
          center.x,
          Math.max(0.06, bounds.min.y - 0.04),
          center.z,
        );
        marker.scale.setScalar(current.draggingCategory ? 1.5 : 1);
        marker.visible = !explodedNow;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('keydown', keydown);
      disposeObject(scene);
      environment.dispose();
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
    if (modelRef.current) {
      scene.remove(modelRef.current.root);
      disposeObject(modelRef.current.root);
    }
    const model = createRobotModel(props.selected, props.mountSlots);
    scene.add(model.root);
    modelRef.current = model;
  }, [props.selected, props.mountSlots]);

  const setCamera = (mode: string) => {
    const camera = cameraRef.current,
      controls = controlsRef.current;
    if (!camera || !controls) return;
    const position =
      mode === 'Top'
        ? new THREE.Vector3(0, exploded ? 24 : 17, 0.2)
        : mode === 'Front'
          ? new THREE.Vector3(0, exploded ? 5.2 : 4, exploded ? 23 : 15)
          : exploded
            ? new THREE.Vector3(13, 11, 16)
            : new THREE.Vector3(10.5, 7.5, 12.5);
    camera.position.copy(position);
    controls.target.set(0, exploded ? 3.4 : 1.6, 0);
    controls.update();
    setView(mode);
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
      <div className="scene-caption">
        <span className="live-dot" /> PIT 01 <b>ATLAS</b>
        <span>Robot workshop</span>
      </div>
      <div className="scene-toolbar" aria-label="3D workshop controls">
        <button
          onClick={() => {
            setExploded((v) => !v);
            const controls = controlsRef.current,
              camera = cameraRef.current;
            if (controls && camera) {
              controls.target.set(0, exploded ? 1.6 : 3.4, 0);
              camera.position.set(
                exploded ? 10.5 : 13,
                exploded ? 7.5 : 11,
                exploded ? 12.5 : 16,
              );
              controls.update();
              setView('Perspective');
            }
            setHint(
              exploded
                ? 'Click a mechanism to inspect it'
                : 'See how the six subsystems fit together',
            );
          }}
          aria-pressed={exploded}
        >
          <Layers3 size={17} />
          {exploded ? 'Assemble' : 'Explode'}
        </button>
        <button
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
          {view}
        </button>
        <button
          aria-label="Reset camera"
          onClick={() => setCamera('Perspective')}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="scene-selection">
        <Scan size={16} />
        <span>{names[props.activeCategory]}</span>
        <small>{exploded ? 'Exploded assembly' : 'Selected mechanism'}</small>
      </div>
      <div className="scene-instructions">
        <Box size={15} />
        {hint}
      </div>
    </div>
  );
}
