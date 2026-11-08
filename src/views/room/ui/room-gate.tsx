import { EntryForm } from "../../../features/enter-room";
import type { EntryResult } from "../../../entities/room";

export function RoomGate({
  action,
}: {
  action: (previous: EntryResult, form: FormData) => Promise<EntryResult>;
}) {
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
          <EntryForm action={action} joining />
        </div>
      </section>
    </main>
  );
}
