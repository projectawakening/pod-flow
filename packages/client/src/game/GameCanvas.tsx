import { Canvas } from "@react-three/fiber";
import React, { Suspense } from 'react';
import { Scene } from "./components/Scene.js";
// import { Scene } from "./components/Scene.js"; // Comment out direct three import

export const GameCanvas = () => {
  console.log("--- GameCanvas.tsx rendering Scene via Suspense ---");
  return (
    <Canvas style={{ background: "#111" }}>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      {/* <ambientLight intensity={0.5} /> */}{/* Remove direct light, Scene will provide it*/}
    </Canvas>
  );

  // Previous minimal box scene (commented out)
  /*
  console.log("--- GameCanvas.tsx rendering R3F Canvas (downgraded R3F, SWC plugin) ---");
  return (
    <Canvas style={{ background: "#333" }}>
      <ambientLight intensity={0.5} />
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </Canvas>
  );
  */
}; 