import { bindings, defineConfig, defineWorker, exports } from "cf/config";
import * as entrypoint from "./src/features/room/server/entry" with { type: "cf-worker" };

export default defineConfig(({ isPreview }) => ({
  worker: defineWorker({
    name: "buzzroom",
    entrypoint,
    compatibilityDate: "2026-10-12",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
    },
    exports: { RoomDO: exports.durableObject({ storage: "sqlite" }) },
    ...(isPreview
      ? {}
      : {
          domains: ["buzzroom.tanakalucky.com"],
          workersDev: false,
        }),
  }),
}));
