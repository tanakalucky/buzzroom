import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      // HTTP回帰テストのRoomDOを通常のローカル開発データから分離する。
      persistState: process.env.BUZZROOM_TEST_STATE
        ? { path: process.env.BUZZROOM_TEST_STATE }
        : true,
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
