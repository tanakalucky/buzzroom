# requirements

buzzroom は、パスワード制のルームでクイズの早押し(バズ)と採点を行う Web アプリ。
問題の配信・出題そのものはアプリの範囲外で、司会(quizmaster)が口頭等で別途行うことを前提にする。

## 全体スコープ

- **ルーム**: パスワード制。招待 URL でもパスワードは必要(URL だけでは参加できない)。参加者はニックネームのみでアカウント不要。
  詳細: [features/room.md](features/room.md)
- **早押し(buzzer)**: 到着順キュー、誤答は今ラウンド参加者ロック+キュー送り、正解は即次ラウンド。
  詳細: [features/buzzer.md](features/buzzer.md)
- **採点(score)**: 正解数・誤答数をラウンドを越えて保持し、host が手動編集できる。
  詳細: [features/score.md](features/score.md)

PR の段階分割と進捗は [plan.md](plan.md) を参照。

## 現時点の非目標(Non-goals)

次は今回のスコープに含めない。将来の要否・仕様は未決定で、現時点で機能や仕様を先取りして実装しない。

- 問題そのものの配信・出題
- 音声通話
- 観戦専用(スペクテーター)モード
- 参加受付の締め切り
- クライアント時刻ずれの補正(レイテンシ補償)
- 自由記述(タイプ入力)の解答
- ルームの有効期限・参加人数上限などの運用上限(未決定の将来課題)

## サーバ権威とリアルタイム同期(将来実装時の方針)

- ルームごとに 1 つの SQLite バックの Durable Object(RoomDO)が状態を保持する。
- クライアントとの通信はルーム単位で 1 本の WebSocket。採点を含む完全な状態スナップショットを配信する(機能ごとに別ソケットを作らない)。
- 早押しの到着順は、RoomDO がリクエストを受信した順序を権威とする。クライアント側の押下時刻や、複数サーバ到着時刻の比較では判定しない。同着の補正も行わない。
- 状態は配信前に永続化する。再接続・Durable Object の hibernation 後も状態を復元する。

## ディレクトリ構成と責務

### 現在(公式 vinext Cloudflare スターターの構成のまま)

- `app/` - ルーティングとページ(App Router)。`app/api/hello` はスターター付属の API ルート例。内容はスターターのままで、`oxfmt` によるフォーマット適用と npm コマンドへの表記修正のみ行われている。
- `vite.config.ts` / `next.config.ts` - ビルド設定。スターターのまま未変更。
- `cloudflare.config.ts` - Worker 設定。本番公開ドメイン(`domains` / `workersDev: false`)を preview(`isPreview`)と production で分岐させる変更済み。他はスターターのまま。

機能固有のコード(`src/features/*` 等)はまだ存在しない。下の「将来」は実装の合意事項であり、現状のディレクトリ構成ではない。

### 将来(機能実装時に導入する、合意済みの方針)

- `src/features/room/` - ルーム作成・参加・参加者一覧・quizmaster 譲渡。サーバ側ロジック(RoomDO)は `server/` に置く。
- `src/features/buzzer/` - キュー・解答権・ラウンドリセットの純粋処理と UI。
- `src/features/score/` - 正解・誤答カウンタと手動編集の UI。
- `src/components/ui/` - 複数 feature で共有する shadcn/ui コンポーネント。必要になるまで導入しない。
- 依存の向き: ブラウザ側コードは `server/` を import しない。RoomDO は `buzzer`・`score` の純粋関数を呼び出してルーム状態をまとめて永続化し、逆依存や循環依存を避ける。
