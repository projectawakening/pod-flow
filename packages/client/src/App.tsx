import { useMUD } from "./MUDContext.js";
import { GameCanvas } from "./game/GameCanvas.js";

const styleUnset = { all: "unset" } as const;

export const App = () => {
  const {
    // network: { tables, useStore }, // We'll use these later
    // systemCalls: { setInteractionDistance, depositInventory, transferToInventory, withdrawInventory }, // We'll use these later
  } = useMUD(); // <-- UNCOMMENT useMUD

  console.log("--- App.tsx rendering (with MUD context) ---");

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#111" }}>
      <GameCanvas />
      <div style={{ position: "absolute", top: "10px", left: "10px", color: "white", pointerEvents: "none" }}>
        Game UI Placeholder (App.tsx - MUD Active)
      </div>
    </div>
  );
};
