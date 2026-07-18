import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
