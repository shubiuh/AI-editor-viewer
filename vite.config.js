import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        "reservoir-demo": "reservoir-demo.html",
        "reservoir-benchmark": "reservoir-benchmark.html"
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: [
        "**/release/**",
        "**/release-build/**",
        "**/electron-build-output/**"
      ]
    }
  }
});
