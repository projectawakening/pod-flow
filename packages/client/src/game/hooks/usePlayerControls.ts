import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// This hook will manage camera targeting and potentially other controls later.
// For now, OrbitControls in Scene.tsx handles direct camera manipulation.
export const usePlayerControls = () => {
  const { camera, scene } = useThree();
  const playerShipRef = useRef<THREE.Object3D | null>(null); // To store a reference to the player ship

  useEffect(() => {
    // Attempt to find the player ship mesh once the scene is populated
    // This is a simple way; a more robust way might involve IDs or context
    const player = scene.children.find(child => child.name === "PlayerShipInstance"); // Assuming PlayerShip will set its name
    if (player) {
      playerShipRef.current = player;
    }

    // Set initial camera target to origin (where player ship starts)
    // OrbitControls will manage the actual camera position based on user input
    // but we can ensure it looks at the player initially.
    // camera.lookAt(0, 1, 0);
    // Note: OrbitControls typically sets its own target. We will refine targeting.

  }, [camera, scene]);

  // useFrame(() => {
  //   if (playerShipRef.current && OrbitControlsRef.current) {
        // If we wanted to force OrbitControls to always target the ship:
        // OrbitControlsRef.current.target.copy(playerShipRef.current.position);
        // OrbitControlsRef.current.update();
  //   }
  // });

  // No direct return needed if it only sets up effects or modifies OrbitControls target implicitly
}; 