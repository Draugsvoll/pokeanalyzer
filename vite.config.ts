import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "require-firebase-app-check-key",
      configResolved(config) {
        if (
          config.command === "build" &&
          !config.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()
        ) {
          throw new Error(
            "VITE_FIREBASE_APPCHECK_SITE_KEY is required for frontend builds. Set it in .env or in the frontend build environment before building the app.",
          );
        }
      },
    },
  ],
  server: {
    watch: {
      usePolling: true,
    },
  },
});
