# フロントエンドのFSDルール

フロントエンドの新規作成・変更ではFeature-Sliced Design (FSD)を使う。
既存構成には[共通手順](../workflows/fsd.md)に従い、変更対象から段階適用する。

## 配置と依存方向

必要なレイヤーだけを使い、空のレイヤーや非推奨の`processes`は作らない。
上位から下位への順序は次のとおり。直下以外の下位レイヤーも参照できる。

`app → pages → widgets → features → entities → shared`

| レイヤー | 責務 |
| --- | --- |
| app | 初期化、プロバイダー、ルーティング、全体スタイル |
| pages | 画面全体と、その画面に閉じたUI・処理 |
| widgets | 複数の要素を組み合わせた自己完結する大きなUI |
| features | ユーザーが行う操作や、再利用する機能 |
| entities | 業務上の概念、そのデータ・ルール・基本UI |
| shared | 業務知識を持たないUI、ライブラリ、外部接続の基盤 |

pages・widgets・features・entitiesは、業務や機能の意味でスライスに分ける。
スライス内は目的に応じて`ui`・`api`・`model`・`lib`・`config`などのセグメントに分ける。
画面内の処理を、将来の再利用だけを理由にfeaturesへ分けない。
appとsharedにはスライスを作らず、直接セグメントを置く。

- 他スライスへの依存は下位レイヤーに限る。上位への依存と同一レイヤーの別スライス参照は禁止する。
- app・sharedの各レイヤー内ではセグメント間の参照を許すが、循環依存は作らない。
- entities同士の業務上不可避な参照に限り、`@x`の専用公開APIを使える。利用先と理由を対象リポジトリに記し、他レイヤーへ例外を広げない。

## 公開APIとimport

- スライス外からは公開API（原則`index.ts`、JavaScriptなら`index.js`）だけを参照し、内部ファイルへの直接importを避ける。必要なexportを明示する。
- スライス内では相対パスで直接参照し、自スライスの公開APIを経由して循環させない。
- sharedのUI・ライブラリは小さい単位で公開し、巨大な一括バレルを作らない。app・sharedのセグメントも公開境界を明示する。
- ソースルート、importエイリアス、共有パッケージ名、ルーターの予約ディレクトリは対象リポジトリで決める。フレームワークの規約とFSDの責務を対応付け、同名ディレクトリを機械的に移動しない。
- 既存の共有パッケージと責務を重複させず、パッケージ境界を越えて内部ファイルを参照しない。

## 参照

- [Layers](https://feature-sliced.design/docs/reference/layers)
- [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- [Public API](https://feature-sliced.design/docs/reference/public-api)
