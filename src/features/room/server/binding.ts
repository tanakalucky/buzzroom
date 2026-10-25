import { exports } from "cloudflare:workers";
import type { RoomDO } from "./room-do";

// 同Workerのloopback bindingで、Previewごとのnamespaceへ接続する。
export function roomStub(roomId: string): DurableObjectStub<RoomDO> {
  return exports.RoomDO.getByName(roomId);
}
