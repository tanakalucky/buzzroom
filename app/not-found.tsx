export default function NotFound() {
  return (
    <main className="page">
      <section className="room-shell">
        <div className="room-gate">
          <h1>ルームが見つかりません</h1>
          <p>招待URLを確認してください。途中で切れていないか、ホストに確認できます。</p>
          <p>
            <a href="/">作成画面へ戻る</a>
          </p>
        </div>
      </section>
    </main>
  );
}
