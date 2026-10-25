import { cookies } from "next/headers";
import { roomStub } from "../../../src/features/room/server/binding";
import { notFound } from "next/navigation";
import { cookieName, hashToken, isRoomId } from "../../../src/features/room/server/security";
import { joinRoom } from "../../../src/features/room/server/actions";
import { EntryForm } from "../../../src/features/room/entry-form";
import { RoomScreen } from "../../../src/features/room/room-screen";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!isRoomId(roomId)) notFound();
  const stub = roomStub(roomId);
  if (!(await stub.exists())) notFound();
  const token = (await cookies()).get(cookieName(roomId))?.value;
  const session = token ? await stub.inspectSession(await hashToken(token)) : null;
  if (session) return <RoomScreen roomId={roomId} />;
  return (
    <main className="page">
      <section className="room-shell">
        <div className="room-header">
          <p>招待されたルーム</p>
          <h1>早押しルーム</h1>
        </div>
        <div className="room-gate">
          <h2>名前とパスワードで入室</h2>
          <p>招待URLを開いた、この画面から参加できます。</p>
          <EntryForm action={joinRoom.bind(null, roomId)} joining />
        </div>
      </section>
    </main>
  );
}
