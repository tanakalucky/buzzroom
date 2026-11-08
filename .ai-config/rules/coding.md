# コーディング規約

## 1. 関数の順序

ファイル内では、主処理を上、呼び出される補助関数を下に置き、caller から callee へ読み下せる配置にする。これは読む順序の規則であり、実行順序とは関係ない。

## 2. 単一責務

関数・コンポーネントは1つの責務だけを持つ。行数だけを理由に分割しない。

## 3. 名前

意味のある名前を付ける。`data` や `process` のような曖昧な名前は、文脈で意味が明確な場合を除き避ける。

## 4. コメント

理由や制約を書く。コードの言い換えは書かない。説明が不要ならコメントは付けない。

## 5. 空行

変数宣言や処理は意味・目的が同じものをまとめ、別の計算・検証・整形などへ移る箇所には空行を置く。
コード生成時も複数のまとまりを詰めて並べない。関連する変数宣言を1件ずつ機械的に空行で分けない。

### 例

```ts
type Item = { price: number; quantity: number };

export function formatOrderTotal(items: Item[], taxRate: number): string {
  const subtotal = calculateSubtotal(items);
  const tax = subtotal * taxRate;

  return formatYen(subtotal + tax);
}

function calculateSubtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
}
```

## 6. テスト

テストケース名は日本語で、条件と期待する振る舞いが分かる名前にする。`正常系`や`test1`のような内容が分からない名前を避ける。

テストはAAA(Arrange・Act・Assert)で、準備・実行・検証を順に分ける。
空行や短いコメントで境界を明確にし、1つのテストで確認する振る舞いを絞る。
AAAのためだけに不要なhelper・mock・複雑な処理を増やさない。
