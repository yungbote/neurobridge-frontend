import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const noStoreEyeAssets = () => ({
    name: "no-store-eye-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url) {
          if (req.url.startsWith("/path-nodes/mediapipe/face_mesh/")) {
            req.url = req.url.replace("/path-nodes", "");
          }
          if (req.url.startsWith("/path-nodes/eye-tracking/")) {
            req.url = req.url.replace("/path-nodes", "");
          }
        }
        if (req.url && /face_mesh_solution_.*\\.(data|wasm|js)/.test(req.url)) {
          if (req.headers) {
            delete req.headers["if-none-match"];
            delete req.headers["if-modified-since"];
          }
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
        next();
      });
    },
  });

  return {
    plugins: [react(), tailwindcss(), noStoreEyeAssets()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",   // important so it listens on all interfaces in the container
      port: 5174,        // match your docker-compose port mapping
    },
    define: {
      // optional: if you want to force-inject the API base URL
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
        env.VITE_API_BASE_URL
      ),
    },
  };
});







