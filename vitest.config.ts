import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@engines": path.resolve(__dirname, "src/engines"),
      "@adapters": path.resolve(__dirname, "src/adapters"),
      "@validators": path.resolve(__dirname, "src/validators"),
    },
  },
});
