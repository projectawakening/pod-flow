console.log("--- index.tsx script started ---");
import ReactDOM from "react-dom/client";
import React, { useState, useEffect } from "react";

import { App } from "./App.js";
import { setup, SetupResult } from "./mud/setup.js";
import { MUDProvider } from "./MUDContext.js";
// import mudConfig from "../../contracts/mud.config.js"; // This will be needed by DevTools if we re-enable it

class ErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: React.ReactNode, children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    console.error("ErrorBoundary caught an error:", error);
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error in React tree (componentDidCatch):", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("react-root");
if (!rootElement) throw new Error("React root not found");
const root = ReactDOM.createRoot(rootElement);

// Restore AppLoader and MUDProvider logic
const AppLoader = () => {
  const [mudSetupResult, setMudSetupResult] = useState<SetupResult | {} | null>(null); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Starting MUD setup...");
    setup().then(result => {
      console.log("MUD setup complete. Result object:", result); 
      if (result && result.network && result.systemCalls) { 
        setMudSetupResult(result);
      } else {
        console.error("MUD setup result is invalid or incomplete.");
        setError("MUD Setup Failed: Invalid result. Check console.");
      }
      setIsLoading(false);
    }).catch(setupError => {
      console.error("Error during MUD setup promise chain:", setupError);
      setError(`MUD Setup Failed: ${setupError.message}. Check console.`);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return <h1>Loading MUD Network...</h1>;
  }

  if (error || !mudSetupResult || Object.keys(mudSetupResult).length === 0) { 
    return <h1>{error || "MUD Setup Failed. Check console."}</h1>; // Simplified error message
  }

  const actualResult = mudSetupResult as SetupResult; 

  return (
    <ErrorBoundary fallback={<h1>Application Rendering Error. Check Console.</h1>}>
      <MUDProvider value={actualResult}> 
        <App />
      </MUDProvider>
    </ErrorBoundary>
  );
};

root.render(
  <React.StrictMode>
    <AppLoader />
    {/* <ErrorBoundary fallback={<h1>App Crashed from index.tsx</h1>}>
      <App />
    </ErrorBoundary> */}
  </React.StrictMode>
);

// DevTools mounting is still commented out
/*
if (import.meta.env.DEV) {
  setup().then(result => { 
    if (result && result.network) { 
      console.log("Attempting to mount DevTools...");
      import("@latticexyz/dev-tools").then(({ mount: mountDevTools }) => {
        try {
          mountDevTools({
            config: mudConfig,
            publicClient: result.network.publicClient,
            walletClient: result.network.walletClient,
            latestBlock$: result.network.latestBlock$,
            storedBlockLogs$: result.network.storedBlockLogs$,
            worldAddress: result.network.worldContract.address,
            worldAbi: result.network.worldContract.abi,
            write$: result.network.write$,
            useStore: result.network.useStore,
          });
          console.log("DevTools mounted or attempt finished.");
        } catch (devToolsError) {
          console.error("Error mounting DevTools:", devToolsError);
        }
      }).catch(devToolsImportError => {
        console.error("Error importing DevTools:", devToolsImportError);
      });
    } else {
      console.warn("Skipping DevTools mount because MUD setup result was invalid.");
    }
  }).catch(error => {
     console.warn("Skipping DevTools mount due to MUD setup error:", error);
  });
}
*/
