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

## サーバ権威とリアルタイム同期

- ルームごとに 1 つの SQLite バックの Durable Object(RoomDO)が状態を保持する。
- クライアントとの通信はルーム単位で 1 本の WebSocket。採点を含む完全な状態スナップショットを配信する(機能ごとに別ソケットを作らない)。
- 早押しの到着順は、RoomDO がリクエストを受信した順序を権威とする。クライアント側の押下時刻や、複数サーバ到着時刻の比較では判定しない。同着の補正も行わない。
- 状態は配信前に永続化する。再接続・Durable Object の hibernation 後も状態を復元する。

## ディレクトリ構成と責務

### 現在(公式 vinext Cloudflare スターターを基盤に機能を追加)

- `app/` - vinext App Router のルート、SSRでのルーム・セッション検証、Server Actionsの接続、レイアウトと全体スタイル。`app/api/hello` はスターター付属のAPI例として保持。
- `vite.config.ts` / `next.config.ts` - ビルド設定。スターターのまま未変更。
- `cloudflare.config.ts` - 既存の本番・Previewのドメイン分岐を保持。同WorkerのRoomDO公開、SQLite binding、room/server/entry.tsへの入口を追加。

フロントエンドはFSDの責務で配置する。詳細は [implementation-decisions.md](implementation-decisions.md) を参照。

### FSDの配置と依存方向

- `src/views/{create-room,room,error,not-found}/` - FSDのpages層。画面全体と画面に閉じた同期処理を置く。`src/pages` はvinextのPages Routerとして解釈されるため使わない。
- `src/features/{enter-room,buzz,edit-score}/` - 名前・パスワード入力、早押し、得点編集のUI。
- `src/entities/room/` - 単一の`RoomState`集約に属する参加者・得点・早押し状態の型と純粋ルール。ルーム状態を別entityへ分割しない。
- 依存の向きは `app → views → features → entities`。スライス外は明示的な`index.ts`公開APIを使い、同一レイヤーの別スライスは参照しない。スライス内では相対importを使う。widgets・shared・entity間の`@x`は必要がないため設けない。
- `src/features/room/server/` は既存のバックエンド配置を維持する。フロントエンドのfeatureスライスではなく、認証・Server Actions・RoomDO・Worker入口の境界。ブラウザ側からimportせず、ルートが既存Server Actionsを画面へ渡す。RoomDOは`entities/room`の純粋ルールを使い、状態をまとめて永続化する。
