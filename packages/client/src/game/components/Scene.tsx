// import { OrbitControls, Sky, Stars } from '@react-three/drei'; // Keep commented
// import { PlayerShip } from './PlayerShip.js'; // Keep PlayerShip import commented for now
// import { usePlayerControls } from '../hooks/usePlayerControls.js'; // Temporarily unused
// import { Sky, Stars } from '@react-three/drei'; // Keep Sky commented out
// import { Cloud } from '@react-three/drei'; // Comment out Cloud
// import { Html } from '@react-three/drei'; // Remove Html import
import { Stars, OrbitControls } from '@react-three/drei'; // Only Stars import
// import { Sky } from '@react-three/drei'; // Ensure Sky is not imported or is commented
// import { PlayerShip } from './PlayerShip'; // Changed import extension
import { PlayerShip } from './PlayerShip.js'; // Re-importing the external PlayerShip
import { Sun } from './Sun.js'; // Import the Sun component

// Inlined PlayerShip component logic (will be removed)
/*
const InlinedPlayerShip = () => {
  return (
    <mesh position={[0, 1, 0]}>
      <sphereGeometry args={[1, 32, 32]}/>
      <meshStandardMaterial color="royalblue"/>
    </mesh>
  );
};
*/

const sunPosition: [number, number, number] = [200, 400, 100]; // Define sun position once

export const Scene = () => {
  // usePlayerControls(); // Temporarily disable to simplify
  // console.log("Rendering Scene with Sky and Stars");

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight 
        position={sunPosition} // Align light with sun position
        intensity={1.5} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Stars radius={100} depth={50} count={1000} factor={4} saturation={0} fade />
      <PlayerShip />
      <Sun />
      <OrbitControls 
        enablePan={true}
        minDistance={5}
        maxDistance={600} // Increased maxDistance to see the sun
        enableDamping={true}
        dampingFactor={0.05}
      />
    </>
  );
}; 