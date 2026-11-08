# Preview E2E の実行 Actions サンプル

Preview の deploy 完了を確認してから GitHub REST API で E2E を起動する例。
イベントと権限を [workflow](preview-e2e.yml)、GitHub API の共通確認を
[通常コード](preview-e2e.mjs)、アプリ固有の照合を [adapter](preview-e2e-adapter.mjs) に分ける。
このディレクトリにあるだけでは Actions は動かない。adapter は未設定時に必ず失敗する。

## 導入先で準備するもの

1. 既存 workflow・scripts と重複を確認し、YAML を `.github/workflows/preview-e2e.yml`、
   2つの `.mjs` を `.github/scripts/` へコピーして統合する。実行時にこの config repo を参照しない。
2. `preview-deploy.yml` を実際の source workflow path に合わせ、下記 adapter を実装する。
   provider の deploy 方式、API、固定 account/Worker、PRとの対応はアプリで決める。
3. `package-lock.json` に Playwright を固定し、`npm run test:e2e:preview` を定義する。
   `PLAYWRIGHT_BASE_URL` を必須として公開済み Preview に接続し、localhost の起動や既定 URL への代替をしない。
   承認済みシナリオ ID/版とテストの対応をアプリ側に残す。認証画面・401/403・別 origin への redirect・
   期待画面の不在は失敗にする。trace/report に秘密や実ユーザーデータを含めない。
4. 信頼済み default branch に workflow と scripts を登録する。`workflow_dispatch` は default branch に
   workflow がないと起動できない。作業 branch へ置いただけでは登録完了にならず、無断 merge で解決しない。
5. GitHub Actions/runner の利用可否と必要な権限を確認する。既存設定・Secrets・認証・権限の追加は
   [Cloudflare 運用ルール](../../rules/cloudflare-deploy.md) と対象タスクの許可に従う。

## adapter の契約

`resolvePreview({ github, context, inputs, run, pull })` は次を **API の現在値からすべて確認** し、
`{ url: 'https://確認済みのpreview-host/', version: '確認済みの不変ID' }` を返す。
不足・不一致・API失敗は throw し、入力値をそのまま返す実装に置き換えない。

- source run の event・actor/実行資格・信頼済み workflow 定義を対象アプリの条件と照合する。
  成功 conclusion だけでは足りない。該当 attempt の deploy job/step が実際に成功したことを確認する。
- source run の PR・head と指定 PR・head の結び付きを確認する。`workflow_run` を経由する deploy では
  run 自体の `head_sha` がテスト対象とは限らない。元 CI run、検証済み artifact の出所など、
  deploy が実際に使った commit まで追う。PR由来 metadata だけを証拠にしない。
- provider 公式 API から固定 account/Worker と正規化した `pr-番号` の Preview を読み、
  deploy が公開した commit SHA、不変 deployment/version ID と `inputs` を照合する。
  `deployment_id` はプロバイダーの不変 ID。URL や任意の文字列を ID の代わりに使わない。
- URL は provider の実結果から取得し、許可した **完全な hostname** と PR別 Preview との対応を照合する。
  HTTPS・本番除外・許可 port・認証情報なしを確認する。PR本文/コメント/入力URLや単なる末尾一致は使わない。
  DNS・redirect を含め、内部ネットワークや本番へ向かう経路を許可しない。
- E2E の前後で同じ検証を行えること。不変URL/versionを優先する。更新可能なURLしかない場合は、
  deploy/cleanup と E2E の間で対象versionを固定するロック等をアプリ側に実装する。
  前後照合だけでは実行途中に一時的に別versionが配信された可能性を排除できない。

provider の読取 credential が必要なら、default branch のみ利用を許す保護された GitHub Environment に置き、
verify/result **だけ** に最小権限で渡す。任意の branch から取得できる repository secret に置かない。
Environment の保護設定はコード中の ref 検査だけで代替できず、設定変更には別途許可が必要。
サンプルは provider credential を登録・参照しない。`e2e` job は PR のコード・npm hook を実行するため、
deploy token、provider secret、Environment secrets、保存済み認証、書込 token を渡さない。
同一 repo の PR も信頼済みとは扱わず、永続 self-hosted runner・共有 cache を使わない。
PRテストの改変による偽陽性はこのworkflowだけでは防げないため、独立レビューとシナリオ対応の確認が別途必要。

## API で起動する

起動元は Preview 完了後の信頼済み default-branch job または許可済みの外部実行者。
次の5項目を確定し、同じ source run/attempt の E2E がないことを全ページから確認して起動する。

- `source_run_id`、`source_run_attempt`: 成功した Preview deploy の run と attempt
- `pr_number`、`head_sha`: 現在 open の同repo PR と完全 SHA
- `deployment_id`: provider APIで確認した不変 deployment/version ID

REST の送信先は `POST /repos/{owner}/{repo}/actions/workflows/preview-e2e.yml/dispatches`。
`ref` は信頼済み default branch、`inputs` は上記5項目。URLは入力に含めない。
[dispatch 関数](preview-e2e.mjs) は検証・全ページの重複確認・この API 呼出を行う。
例えば既存の trusted dispatcher job で `actions/github-script` の `retries: 0` を指定し、
信頼済み scripts を checkout した後に次を呼ぶ。`verifiedInputs` は source/provider の照合で組み立てる。
PR本文をコードに展開したり、PRの依存 install をこのjobで実行したりしない。

```js
const { dispatch } = await import(`${process.env.GITHUB_WORKSPACE}/.github/scripts/preview-e2e.mjs`);
await dispatch({ github, context, inputs: verifiedInputs });
```

起動jobだけに `actions: write`、検証用に `contents: read` と `pull-requests: read` を指定する。
受信側 YAML は read-only。PR status/comment を書かず、PRの権限も変更しない。
外部 token を使う場合も対象repo限定・Actions writeが必要で、新規発行はこのサンプルの適用に含まれない。

呼出側は `preview-e2e-dispatch-<source_run_id>-<source_run_attempt>` の concurrency 等で直列化する。
一覧確認と POST は原子的ではないため、同じキーの起動経路を1つに限定する。
204 は受付だけを意味し、E2E成功ではない。応答不明なら run一覧を読み戻し、確認できるまで再送しない。
失敗した既存 E2E は結果を調べて承認範囲で再実行する。run/attempt・古いhead・cleanup後の状態を再検証する。

## 結果と適用範囲

`result` job は E2E 成功と前後の URL/version・現在head一致を確認して summary に対応を残す。
失敗・skipped・cancelled は成功へ置き換えない。ログ・run URL と artifact、シナリオ別結果を確認する。
このrunの GitHub `head_sha` は dispatch先の default branchであり、PR headのcheckとは限らない。
マージ判断では inputs/summary の対象SHAと現在PRを照合し、このrunだけをPRのrequired checkに流用しない。
このサンプルは merge・deploy・cleanup・認証回避を実行しない。

サンプルの共通処理は `node --test .ai-config/examples/preview-e2e/preview-e2e.test.mjs` で検証する（Node 22以上）。
導入先では `node --check .github/scripts/preview-e2e.mjs`、adapterのAPI fakeテストと YAML の検査も行う。
導入時には成功のほか stale head、別PR/fork、source失敗/skip/別attempt、URL/version不一致、
重複/応答不明、E2E失敗/認証redirect、実行中の更新/close を確認する。構文検査を実 Preview E2E 成功と扱わない。

仕様参照: [workflow_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch)、
[REST dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)、
[workflow_run の注意点](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run)。
