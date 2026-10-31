import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{client,server,shared}/**/*.test.{ts,tsx}"],
  },
});
