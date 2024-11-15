import path from "path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import Pages from "vite-plugin-pages";

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
  plugins: [react(), Pages(), updateCommonjsPlugin()],
  base: "/stat-viewer2/",
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
