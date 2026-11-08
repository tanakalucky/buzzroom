import { cookies } from "next/headers";
import { roomStub } from "../../../src/features/room/server/binding";
import { notFound } from "next/navigation";
import { cookieName, hashToken, isRoomId } from "../../../src/features/room/server/security";
import { joinRoom } from "../../../src/features/room/server/actions";
import { RoomGate, RoomScreen } from "../../../src/views/room";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) notFound();
  const stub = roomStub(roomId);
  if (!(await stub.exists())) notFound();
  const token = (await cookies()).get(cookieName(roomId))?.value;
  const session = token ? await stub.inspectSession(await hashToken(token)) : null;
  if (session) return <RoomScreen roomId={roomId} />;
  return <RoomGate action={joinRoom.bind(null, roomId)} />;
}
