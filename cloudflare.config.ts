import { bindings, defineConfig, defineWorker, exports } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  worker: defineWorker({
    name: "buzzroom",
    entrypoint: "src/features/room/server/entry.ts",
    compatibilityDate: "2026-10-12",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      ROOMS: bindings.durableObject({ worker: "buzzroom", exportName: "RoomDO" }),
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
