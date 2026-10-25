import { bindings, defineConfig, defineWorker, exports } from "cf/config";
import * as entrypoint from "./src/features/room/server/entry" with { type: "cf-worker" };

export default defineConfig(({ isPreview }) => ({
  worker: defineWorker({
    name: "buzzroom",
    entrypoint,
    compatibilityDate: "2026-10-12",
    compatibilityFlags: ["nodejs_compat"],
    // 通常workers.dev公開とは別。既存Access配下のPR Preview URLを保持する。
    previewUrls: true,
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      QA_ENABLED: bindings.json(isPreview),
      VERSION: bindings.versionMetadata(),
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
