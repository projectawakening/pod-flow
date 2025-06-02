export const Sun = () => {
  const sunPosition: [number, number, number] = [200, 400, 100]; // Explicitly typed position

  return (
    <mesh position={sunPosition}>
      <sphereGeometry args={[20, 32, 32]} />
      <meshBasicMaterial color="yellow" toneMapped={false} />
    </mesh>
  );
}; 