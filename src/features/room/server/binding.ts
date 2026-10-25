import { env } from "cloudflare:workers";
import type { RoomDO } from "./room-do";
// cf/config は同Workerの名前を文字列指定するとRPC型を推論しないため、
// 生成EnvのROOMSだけを、実際にexportしたクラス型へ絞り込む。
export function roomStub(roomId: string) {
  return (env.ROOMS as DurableObjectNamespace<RoomDO>).getByName(roomId);
}
