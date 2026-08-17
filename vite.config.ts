import path from "path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import Pages from "vite-plugin-pages";
import tailwindcss from "@tailwindcss/vite";

import commonjs from "@rollup/plugin-commonjs";

export const updateCommonjsPlugin = (): Plugin => {
  const commonJs22 = commonjs({
    include: [/node_modules/],
    extensions: [".js", ".cjs"],
    strictRequires: true,
  });

  return {
    name: "new-common-js",
    options(rawOptions) {
      const plugins = Array.isArray(rawOptions.plugins)
        ? [...rawOptions.plugins]
        : rawOptions.plugins
        ? [rawOptions.plugins]
        : [];

      const index = plugins.findIndex(
        // @ts-ignore
        (plugin) => plugin && plugin.name === "commonjs"
      );
      if (index !== -1) {
        plugins.splice(index, 1, commonJs22);
      }

      const nextConfig = { ...rawOptions, plugins };
      // @ts-ignore
      return commonJs22.options.call(this, nextConfig);
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), Pages(), tailwindcss(), updateCommonjsPlugin()],
  base: "/stat-viewer2/",
  // latitude.sh's S3 gateway serves no CORS headers and PutBucketCors is
  // NotImplemented, so the browser can't talk to it directly. Proxy in dev.
  //
  // SigV4 signs BOTH the host header and the URI path, so neither may be
  // touched: the app signs for objects.nyc.storage.sh and only *sends* here
  // (see S3Manager), changeOrigin restores that host, and there is no rewrite.
  // Keyed on the bucket path — add a line here for each extra bucket.
  server: {
    proxy: {
      "/workerresolved": {
        target: "https://objects.nyc.storage.sh",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Prevents Rollup from creating separate chunks for dynamic imports
        inlineDynamicImports: true,
        // Optionally, ensure that all dependencies are bundled together
        manualChunks: undefined,
      },
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});