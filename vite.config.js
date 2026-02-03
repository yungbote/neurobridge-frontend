import fs from "fs";
import https from "https";
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

  const serveMediapipeAssets = () => {
    const version = "0.4.1633559619";
    const baseDir = path.resolve(__dirname, "public", "mediapipe", "face_mesh");
    const mimeFor = (filePath) => {
      if (filePath.endsWith(".wasm")) return "application/wasm";
      if (filePath.endsWith(".js")) return "application/javascript";
      return "application/octet-stream";
    };
    const fetchCdn = (url, res) =>
      new Promise((resolve) => {
        https
          .get(url, (cdnRes) => {
            res.statusCode = cdnRes.statusCode || 502;
            res.setHeader("Content-Type", mimeFor(url));
            cdnRes.pipe(res);
            cdnRes.on("end", resolve);
          })
          .on("error", () => {
            res.statusCode = 502;
            res.end();
            resolve();
          });
      });
    return {
      name: "serve-mediapipe-assets",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url) return next();
          const rawUrl = req.url;
          if (
            !rawUrl.startsWith("/mediapipe/face_mesh/") &&
            !rawUrl.startsWith("/path-nodes/mediapipe/face_mesh/")
          ) {
            return next();
          }
          const cleaned = rawUrl.startsWith("/path-nodes/") ? rawUrl.replace("/path-nodes", "") : rawUrl;
          const url = new URL(cleaned, "http://localhost");
          const rel = url.pathname.replace("/mediapipe/face_mesh/", "");
          const localPath = path.join(baseDir, rel);
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          if (fs.existsSync(localPath)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", mimeFor(localPath));
            fs.createReadStream(localPath).pipe(res);
            return;
          }
          const cdnUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${version}/${rel}`;
          await fetchCdn(cdnUrl, res);
        });
      },
    };
  };

  return {
    plugins: [react(), tailwindcss(), serveMediapipeAssets(), noStoreEyeAssets()],
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






