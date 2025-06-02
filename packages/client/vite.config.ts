import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react"; // Comment out or remove
import reactSWC from "@vitejs/plugin-react-swc"; // Import the SWC plugin

export default defineConfig({
  plugins: [reactSWC()], // Use the SWC plugin
  server: {
    port: 3000,
    fs: {
      strict: false,
      allow: [
        ".",
        "../..",
      ],
    },
  },
  optimizeDeps: {
    include: [
      '@react-three/fiber',
      'three',
      'use-sync-external-store/shim/with-selector',
      'react/jsx-runtime',
      'react/jsx-dev-runtime'
    ],
  },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: true,
  },
});
