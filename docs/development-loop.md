# 開発ループの接続と品質確認

対象は `tanakalucky/buzzroom`。配布元 `tanakalucky/ai-dev-config` の固定版
`83601d2e9e5293bbb72db8356657ed8f2f180237`（PR #32）から6配布物を統合する。
配布対象は `AGENTS.md`・`CLAUDE.md`・`.ai-config/`・`.agents/`・`.claude/`・`.codex/agents/`。
役割の直接委譲と受け渡しは [共通契約](../.ai-config/workflows/agent-handoff.md) に従う。
共通手順は `.ai-config/`、アプリの仕様は requirements/features、コマンドは package.json を正本とする。

## CI とローカル UI E2E

CI は PR の merge ref ではなく実際の head を checkout し、その SHA を照合する。
既存 lint・整形・型生成・型検査・通常 build・単体/DO/HTTP テストに加え、
Python 標準の構造テストと `npm run test:e2e` を実行する。
構造テストは配布物の参照・入口・定義を確認し、実モデルの委譲や外部操作の成功を保証しない。

UI E2E は通常 build 後、`npx --no-install playwright install chromium` と `npm run test:e2e` で実行する。
既存 Chromium を使う場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` にその実行ファイルを指定できる。
127.0.0.1:4173 のみで一時 SQLite を使い、既存サーバーを再利用しない。
ブラウザ context を分離して UI の操作と表示を確認する。trace・HAR・video・storageState は保存しない。
結果 JSON は Git 管理外の `test-results/e2e.json`、CI では head/attempt 付き artifact に保存する。
テスト結果を同じ branch に commit して対象 head を変えない。

## Preview 完了から hosted UI E2E への引渡し

CI と preview-deploy は別 workflow。両方の run URL・attempt・実結果を同じ最終 PR head に照合する。
preview-deploy は直前にも PR の open/head を確認し、既存 `cf previews deploy pr-N --prebuilt` を使う。
cf beta.14 は `workers/commit_sha` を checkout ではなく `GITHUB_SHA` 優先で採用するため、
deploy step は期待 PR head と実 checkout SHA を照合し、cf 子プロセスだけにその SHA を渡す。
workflow 全体の event SHA は変更しない。公式 API の deployment annotation `workers/commit_sha` も PR head と一致することを確認する。
公式 deploy 出力と summary を取得し、公式 API/CLI の実結果から Preview URL と immutable deployment URL・version ID を確定する。
URL の文字列を推測して成功証拠にしない。CLI が構造化結果を返さない場合はrepo最上位の指揮者が公式結果を読取照合する。

`pr-N` URL は更新可能なので、E2E の前後で PR head とその Preview の deployment version を再取得し、
同じ head/deployment であることを確認する。既存 Preview QA の VERSION は追加の照合に利用できるが、
`/__qa` の native DO 検査をブラウザ UI E2E の代わりにはしない。

### 着手前の能力確認

シナリオ操作を始める前に、実行担当が既存の手段・権限で行える範囲と不足を対象 PR に短く記録する。
既知の能力結果は対象 URL・head/deployment・利用手段との整合を確認して再利用し、完全なシナリオを二重実行しない。
未確認は未確認のまま残し、記入だけで操作可能・検証成功とはしない。

```text
確認日時・実行者 / 記録先（PRコメントまたは非秘密artifact）
対象PR head / 公式Preview・deployment URL・version / workers/commit_shaとの一致
独立3クライアント（司会＋参加者2人）の既存手段・セッション分離の方法 / 可・不可・未確認
対象URLを既存Accessで表示できるか / 可・不可・未確認と根拠
320px・390pxそれぞれの表示・操作手段 / 可・不可・未確認と不足
再利用した既知結果への参照・対象との整合 / 今回確認した範囲
実行可能なBR-UI/1項目 / 未対応項目・未完了の品質条件 / 代替判断が必要な対象
結果の記録手段 / 停止理由・必要な判断・引渡し先（なければなし）
```

能力情報の不足だけを理由に全作業を止めず、独立して行える確認は進める。
既存認証済みブラウザが使えない場合など、実際に満たせない品質条件は blocker として引き渡し、成功にしない。
新しい権限・認証・Access設定・aliasを作らず、Cookie/tokenの抽出・移送や拒否の迂回もしない。
既存許可の再承認や新たな必須承認gateは追加せず、代替やHosted免除は自動判断しない（文書のみの変更も同様）。
PR #4限定のCI mobile代替承認を他の実行に流用せず、既知の制限の再確認を新規発見や一般的な改善効果としない。

### シナリオと結果の記録

既存 Access に認証済みのブラウザから、架空名の専用テストルームで次のシナリオを確認する。
根拠は [既存仕様](requirements.md)、[機能仕様](features/room.md)、[既存 hosted 操作](hosted-qa.md)。
アプリの新機能・仕様変更のためのシナリオではなく、動作維持の検証である。

| ID/版              | UI 操作と期待結果                                                                  | ローカルケース/hosted 記録                  |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| BR-UI/1 entry      | 作成・招待 URL の gate・誤パスワード拒否・再試行・独立2参加者、3画面の人数一致     | tools/e2e/game.spec.ts / 同項目の実画面結果 |
| BR-UI/1 buzzer     | 2参加者の順序、誤答後の順位維持とロック、reload 復元、正解で次ラウンド、手動 reset | 同上 / 同項目の実画面結果                   |
| BR-UI/1 score-host | 得点編集の全画面反映、司会交代、司会切断時の復帰待ちと本人復帰                     | 同上 / 同項目の実画面結果                   |
| BR-UI/1 mobile     | 320/390px で横にはみ出さず参加者の早押しボタンが表示                               | 同上 / 同項目の実画面結果                   |

repo最上位の指揮者は対象 PR に以下の非秘密の記録を残し、全項目を同じ最終 head に照合する。

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

通常 PR で進め、repo最上位の指揮者がmerge直前に期待headを再取得する。
CI・Preview・hosted UI E2E・独立3観点の同SHA完了とP0/P1収束、未分類・未完了なしを照合し、対象repo/branch・merge操作の現在有効な本人許可と安全・権限条件がすべて成立する場合だけ、既存の承認済み手段で期待headを指定してmergeを判断・実行する。
条件不足や拒否では停止し、別経路・別担当で迂回しない。実装者子・レビュー担当はmerge/deployを行わず、本番deployと認証・security・権限変更は別の安全境界に従う。
これは運用ゲートであり、全員への技術的な強制や branch protection の保証ではない。
head 変更時は以前の成功を流用しない。本番は新 main の CI/deploy の成功後、`/`・`/api/hello`・`/__qa` の404を read-only で確認する。
本番で QA を有効化したり、検証用ゲームデータを書き込んだりしない。

## 既存実行と週次2系統の接続契約

Coordinatorは日次のIssue確認・整理と依頼、本人への質問・結果の受け渡しを担う。依頼前に既存UIのrepo/Issue・既存依頼を確認し、受理後はrepo最上位の指揮者が既存実行の管理先でrepo/Issue/実行URLを照合して同じ実行の進行・品質・停止再開・重複防止を管理する。
この文書は外部 automation の変更・複製起動・スケジュール・自動投稿を有効化しない。
実行管理先への安全な参照と本人識別は外側の Coordinator が保持し、私的な識別子や指示本文を公開 repo へ転記しない。
停止時は固定 base/head、branch/PR、段階、質問と承認対象、レビュー回数、既存記録を引き継ぐ。

週次は `repository / 週開始・終了 / timezone / bug|refactor` をキーに、独立した2系統で進める。
週範囲・timezone・固定 head は開始時に明示する。Discussion は系統ごとに1つ、候補 ID/版と採否・反対理由をその中に保持する。
投稿担当は有効な Discussions/category と操作権限を読取確認し、全ページの既存 Discussion/Issue を照合して重複を避ける。
Discussion が無効、権限不足、送信結果 unknown の場合は投稿を止め、設定変更や別経路の再送で迂回しない。
独立5人の同候補・同版への全票完了と3賛成で採用し、採用 Issue の必要性を再投票しない。
将来の週次実行・投稿には、その対象に有効な本人の許可と既存接続が必要である。
