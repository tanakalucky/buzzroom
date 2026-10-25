"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="room-shell">
        <div className="room-gate">
          <h1>読み込めませんでした</h1>
          <p>接続を確認して、もう一度お試しください。</p>
          <button onClick={reset}>再試行</button>
          <p>
            <a href="/">作成画面へ戻る</a>
          </p>
        </div>
      </section>
    </main>
  );
}
