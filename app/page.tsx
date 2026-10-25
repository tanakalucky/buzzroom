import { EntryForm } from "../src/features/room/entry-form";
import { createRoom } from "../src/features/room/server/actions";
export default function Home() {
  return (
    <main className="page">
      <div className="page-top">
        <p>QUIZ SHOW STYLE / CREATE ROOM</p>
        <span>仲間と楽しむ、早押しクイズ</span>
      </div>
      <section className="entry-shell">
        <div className="entry-intro">
          <p>START YOUR QUIZ</p>
          <h1>
            合言葉ひとつで、
            <br />
            クイズをはじめよう。
          </h1>
          <p>
            名前とパスワードを設定したら、
            <br />
            ルームURLを仲間に届けるだけ。
          </p>
          <div className="entry-art" aria-hidden="true">
            ϟ
          </div>
          <ol>
            <li>名前とパスワード</li>
            <li>URLで招待</li>
            <li>早押しスタート</li>
          </ol>
        </div>
        <div className="entry-form">
          <h2>ルームをつくる</h2>
          <p>ルーム名やアカウントは不要です。</p>
          <EntryForm action={createRoom} />
        </div>
      </section>
    </main>
  );
}
