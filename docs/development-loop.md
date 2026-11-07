# 開発ループの接続と品質確認

対象は `tanakalucky/buzzroom`。配布元 `tanakalucky/ai-dev-config` の固定版
`9878d48de386a170766c6640843d95df621c9f08` から5配布物を統合する。
共通手順は `.ai-config/`、アプリの仕様は requirements/features、コマンドは package.json を正本とする。

## CI とローカル UI E2E

CI は PR の merge ref ではなく実際の head を checkout し、その SHA を照合する。
既存 lint・整形・型生成・型検査・通常 build・単体/DO/HTTP テストに加え、
Python 標準テスト、helper の合成 fixture、`npm run test:e2e` を実行する。
合成確認は証拠の整合性だけを扱い、実モデルや外部操作の成功を保証しない。

UI E2E は通常 build 後、`npx --no-install playwright install chromium` と `npm run test:e2e` で実行する。
既存 Chromium を使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` にその実行ファイルを指定できる。
127.0.0.1:4173 のみで一時 SQLite を使い、既存サーバーを再利用しない。
ブラウザ context を分離して UI の操作と表示を確認する。trace・HAR・video・storageState は保存しない。
結果 JSON は Git 管理外の `test-results/e2e.json`、CI では head/attempt 付き artifact に保存する。
テスト結果を同じ branch に commit して対象 head を変えない。

## Preview 完了から hosted UI E2E への引渡し

CI と preview-deploy は別 workflow。両方の run URL・attempt・実結果を同じ最終 PR head に照合する。
preview-deploy は直前にも PR の open/head を確認し、既存 `cf previews deploy pr-N --prebuilt` を使う。
公式 deploy 出力と summary を取得し、公式 API/CLI の実結果から Preview URL と immutable deployment URL・version ID を確定する。
URL の文字列を推測して成功証拠にしない。CLI が構造化結果を返さない場合は Coordinator が公式結果を読取照合する。

`pr-N` URL は更新可能なので、E2E の前後で PR head とその Preview の deployment version を再取得し、
同じ head/deployment であることを確認する。既存 Preview QA の VERSION は追加の照合に利用できるが、
`/__qa` の native DO 検査をブラウザ UI E2E の代わりにはしない。

既存 Access に認証済みのブラウザから、架空名の専用テストルームで次のシナリオを確認する。
根拠は [既存仕様](requirements.md)、[機能仕様](features/room.md)、[既存 hosted 操作](hosted-qa.md)。
アプリの新機能・仕様変更のためのシナリオではなく、動作維持の検証である。

| ID/版              | UI 操作と期待結果                                                                  | ローカルケース/hosted 記録                  |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| BR-UI/1 entry      | 作成・招待 URL の gate・誤パスワード拒否・再試行・独立2参加者、3画面の人数一致     | tools/e2e/game.spec.ts / 同項目の実画面結果 |
| BR-UI/1 buzzer     | 2参加者の順序、誤答後の順位維持とロック、reload 復元、正解で次ラウンド、手動 reset | 同上 / 同項目の実画面結果                   |
| BR-UI/1 score-host | 得点編集の全画面反映、司会交代、司会切断時の復帰待ちと本人復帰                     | 同上 / 同項目の実画面結果                   |
| BR-UI/1 mobile     | 320/390px で横にはみ出さず参加者の早押しボタンが表示                               | 同上 / 同項目の実画面結果                   |

Coordinator は対象 PR に以下の非秘密の記録を残し、全項目を同じ最終 head に照合する。

```text
repository / branch / PR / 固定base / PR head / 実checkout SHA
CI run URL・attempt・結果 / preview run URL・attempt・結果
Preview URL / deployment URL / deployment version / E2E前後のhead・version確認
BR-UI/1 の各項目・実行者・実行日時・対象URL・結果 / E2E記録URL
独立3観点・ラウンド・対象SHA・P0/P1/未分類/未完了
```

記録は PR コメントまたは artifact に保存する。画像は架空名と公開ゲーム状態だけに限定し、
認証 Cookie・token・生ヘッダー・私的な会話・内部 automation 本文は記録しない。
Access ログイン画面、未実行、skipped、対象不一致を成功としない。
Cloudflare deploy token は Access 通過資格ではない。機械認証が存在しなければ hosted は手動で確認し、
既存認証済みブラウザを利用できない場合は blocker として停止する。
Service Token・Service Auth policy・CI secret・Access 許可を追加して通過させない。

通常 PR で進め、Coordinator が merge 直前に期待 head を再取得する。
CI・Preview・hosted UI E2E・独立3観点の同 SHA 完了と P0/P1 収束が揃い、現在の本人の対象限定許可がある場合だけ merge を判断する。
これは運用ゲートであり、全員への技術的な強制や branch protection の保証ではない。
head 変更時は以前の成功を流用しない。本番は新 main の CI/deploy の成功後、`/`・`/api/hello`・`/__qa` の404を read-only で確認する。
本番で QA を有効化したり、検証用ゲームデータを書き込んだりしない。

## 既存実行と週次2系統の接続契約

Coordinator が既存実行の管理先で repo/Issue/実行URL を確認し、同じ実行を継続する。
この文書は外部 automation の変更・複製起動・スケジュール・自動投稿を有効化しない。
実行管理先への安全な参照と本人識別は外側の Coordinator が保持し、私的な識別子や指示本文を公開 repo へ転記しない。
停止時は固定 base/head、branch/PR、段階、質問と承認対象、レビュー回数、既存記録を引き継ぐ。

週次は `repository / 週開始・終了 / timezone / bug|refactor` をキーに、独立した2系統で進める。
週範囲・timezone・固定 head は開始時に明示する。Discussion は系統ごとに1つ、候補 ID/版と採否・反対理由をその中に保持する。
投稿担当は有効な Discussions/category と操作権限を読取確認し、全ページの既存 Discussion/Issue を照合して重複を避ける。
Discussion が無効、権限不足、送信結果 unknown の場合は投稿を止め、設定変更や別経路の再送で迂回しない。
独立5人の同候補・同版への全票完了と3賛成で採用し、採用 Issue の必要性を再投票しない。
将来の週次実行・投稿には、その対象に有効な本人の許可と既存接続が必要である。
