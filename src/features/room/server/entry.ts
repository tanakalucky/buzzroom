import vinext from "vinext/server/fetch-handler";
import { isRoomId, sameOrigin } from "./security";
import { roomStub } from "./binding";
import { qaResponse } from "./qa";

// vinext と同じ 1 MiB 上限。早期拒否で本文を未読にすると、ローカルの
// workerd service binding が接続を reset するため、POST は入口で読み切る。
// https://github.com/cloudflare/workerd/issues/7634
const MAX_ACTION_BYTES = 1048576;
async function preparePost(request: Request): Promise<Request | Response> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ACTION_BYTES) {
          await reader.cancel();
          return new Response("入力が大きすぎます。", { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (!sameOrigin(request.headers.get("Origin"), request.url)) {
    return new Response("この送信元からは操作できません。", { status: 403 });
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { method: "POST", body });
}

// vinext 1.1 のRoute Handlerは101応答を通常Responseに変換するため、
// 同じWorkerの入口でWebSocketだけを直結する。通常HTTPはvinextへ。
async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/__qa" && env.QA_ENABLED !== true)
    return new Response("Not found", { status: 404 });
  const match = /^\/room\/([^/]+)\/socket$/.exec(path);
  if (match && isRoomId(match[1])) return roomStub(match[1]).fetch(request);
  if (request.method === "POST") {
    const prepared = await preparePost(request);
    if (prepared instanceof Response) return prepared;
    request = prepared;
  }
  if (path === "/__qa") return qaResponse(request, (input) => handleRequest(input, env, ctx));
  return vinext.fetch(request, env, ctx);
}
export default { ...vinext, fetch: handleRequest };
export { RoomDO } from "./room-do";
