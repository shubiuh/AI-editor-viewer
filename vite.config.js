import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        "reservoir-demo": "reservoir-demo.html"
      }
    }
  },
  server: {
    watch: {
      ignored: [
        "**/release/**",
        "**/release-build/**",
        "**/electron-build-output/**"
      ]
    }
  }
});
