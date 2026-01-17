# Browser Extension - CLAUDE.md

NovelAI（https://novelai.net）で生成した画像をsoejiに直接アップロードするChrome/Firefox両対応の拡張機能。

## ディレクトリ構造

```
browser-extension/
├── manifest.json           # 拡張機能マニフェスト (MV3)
├── background.js           # Service Worker
├── content-scripts/
│   ├── upload.js           # NovelAI用アップロードスクリプト
│   └── upload.css          # スタイル定義
└── popup/
    ├── popup.html          # 設定ポップアップHTML
    ├── popup.js            # 設定ポップアップロジック
    └── popup.css           # ポップアップスタイル
```

## 技術仕様

- **Manifest V3**: Chrome/Firefox両対応
- **認証**: `X-Watcher-Key`ヘッダー（backend の watcher と同じ方式）
- **CORS**: Content Scriptから直接バックエンドにアップロード
- **ストレージ**: `browser.storage.local`（設定保存）

## コンポーネント

### Content Script (`content-scripts/upload.js`)

NovelAIの画像グリッドにアップロードボタンを注入するスクリプト。

#### 主要クラス: `SoejiUploader`

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `uploadQueue` | Array | アップロード待機キュー（`{id, blobUrl, status}`） |
| `history` | Map | 画像状態の一元管理（blob URL → `{status, index, bgHash}`）。indexはDOM位置（0=最新） |
| `currentBatchHasError` | boolean | 現在のバッチでエラーが発生したか |
| `resultBadgeTimeout` | number | 結果バッジ非表示タイマーID |
| `currentButton` | Element | バッジ更新用のボタン参照 |
| `historyBadgeTimeouts` | Map | blob URL → タイムアウトID（完了バッジ自動非表示用） |
| `historyObserver` | MutationObserver | 履歴コンテナ監視（新規アイテム検出時にインデックスシフト） |

#### アップロードフロー

1. `injectButton()`: `.image-grid-image`要素を検出し、アップロードボタンを注入
   - 画像srcの変更を`MutationObserver`で監視し、アイコンの半透明状態を更新
2. `handleUpload()`: ボタンクリック時にキューに追加
   - 同じblob URLがキュー内にある場合は追加しない（連打防止）
   - 既にアップロード済みの画像でも再アップロード可能
   - `history` Mapにstatusを追加し、`syncHistoryBadges()`でバッジを同期
3. `processQueue()`: キューから1件ずつアップロードを開始
4. `executeUpload()`: blob URLから画像を取得し、バックエンドにPOST
5. `showResultStatus()`: キュー完了時に結果バッジを表示
6. `updateBadges()`: キュー状態に応じてバッジを更新

### UI要素

#### アップロードボタン (`.soeji-upload-btn`)

- NAIの既存ボタンと並んで表示
- アイコン: インラインSVG（アップロード矢印）
- アップロード済み/中の画像ではアイコン（SVG）のみ `opacity: 0.4`（半透明）
  - `.soeji-uploaded` クラスで制御
  - バッジは半透明にならない
- `disabled`にはしない（いつでも押せる）
- 既にアップロード済みの画像でも再アップロード可能（何かあったときの救済措置）

#### アップロード進捗バッジ (`.soeji-badge`、右上)

| 状態 | クラス | 表示 | 色 |
|------|--------|------|-----|
| アップロード中 | `soeji-badge-uploading` | スピナー（回転） | 青 (#3b82f6) |
| 完了 | `soeji-badge-success` | チェックマーク (✓) | 緑 (#22c55e) |
| エラー | `soeji-badge-error` | エクスクラメーション (!) | 赤 (#ef4444) |
| 非表示 | `soeji-badge-hidden` | - | - |

**状態遷移:**
- アップロード中のスピナーは常に表示
- 完了・エラーは3秒後に自動で非表示
- 完了/エラー表示中に新規アップロード開始 → スピナーが優先
- エラー後に新バッチが成功 → 成功を表示（`currentBatchHasError`をリセット）
- スピナーは `appendChild` でDOM要素として追加

#### キュー数バッジ (`.soeji-queue-badge`、右下)

- アップロード中 + 待機中の合計数を表示
- 0のときは非表示
- 白背景に黒文字

### Background Script (`background.js`)

Service Workerとして動作し、以下を担当:
- 設定の読み込み・保存
- Content Scriptへの設定提供

### Popup (`popup/`)

拡張機能アイコンクリック時の設定画面:
- バックエンドURL入力
- API Key入力
- 接続テスト機能

## 開発コマンド

```bash
cd browser-extension
npm install

# 開発モード
npm run dev:firefox  # Firefox で開発
npm run dev:chrome   # Chrome で開発

# ビルド
npm run build        # パッケージ作成（Chrome / Firefox 両対応）

# Lint
npm run lint         # web-ext lint
```

## CSS実装ルール

1. **SVGアイコン**: `innerHTML`でインラインSVGを挿入（アップロードアイコン）
2. **スピナー**: `.soeji-spinner` クラスを持つ `<span>` 要素を `appendChild` で追加
3. **アイコン半透明**: `.soeji-uploaded` クラスをボタンに付与し、`.soeji-upload-btn.soeji-uploaded svg` で `opacity: 0.4` を指定

## バックエンドとの連携

### エンドポイント

| パス | メソッド | 説明 |
|-----|---------|------|
| `/api/upload` | POST | 画像アップロード |
| `/api/upload/test` | GET | API Key検証 |

### リクエストヘッダー

```
X-Watcher-Key: <API Key>
Content-Type: multipart/form-data
```

### レスポンス

```json
{
  "success": true,
  "duplicate": false,
  "image": { ... }
}
```

- `duplicate: true` の場合も成功として扱う（エラーにはしない）

## 履歴アイテムとの紐付け

### DOM構造

```
#historyContainer
  └─ .sc-5d63727e-2（履歴アイテムコンテナ）
       ├─ .sc-5d63727e-28（履歴アイテム1、一番上が最新）
       ├─ .sc-5d63727e-28（履歴アイテム2）
       └─ ...
```

### history Map による一元管理

画像の状態を `history` Map で一元管理する。

```javascript
this.history = new Map(); // blob URL → { status, index, bgHash }
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `status` | string | `'pending'`/`'uploading'`/`'success'`/`'duplicate'`/`'error'`/`'hidden'` |
| `index` | number | DOM上の位置（0 = 最新/一番上） |
| `bgHash` | string | 履歴アイテムの`background-image` URL（削除検出用） |

- **半透明判定**: `history.has(blobUrl)` で判定（一度でもアップロード処理に入れば半透明）
- **DOM参照なし**: DOM要素への参照は持たず、indexでDOM位置を追跡
- **削除検出**: `bgHash`でDOM要素と突合し、削除時のインデックス修正を行う

### インデックスシフト（追加時）

新しい履歴アイテムがDOMに追加されると、既存アイテムのインデックスがずれる。
`MutationObserver`で履歴コンテナを監視し、新規アイテム検出時に全エントリのindexをシフト。

```javascript
shiftHistoryIndices(count) {
  for (const [blobUrl, data] of this.history) {
    data.index += count;
  }
}
```

### インデックス修正（削除時）

履歴アイテムが削除されると、`bgHash`を使ってDOM要素と突合し、インデックスを修正する。

```javascript
handleHistoryDeletion() {
  // 1. data.index が DOM 要素数を超える場合、最後の要素と突合
  // 2. bgHash が一致すれば index をクランプ後の値に更新
  // 3. 不一致の場合、index - 1 の位置も確認
  // 4. それでも一致しなければ、そのエントリ自体が削除されたと判断
  //    → history Map から削除
}
```

### バッジ同期フロー

状態変更時に毎回DOMを走査してバッジを同期する方式。

1. `updateHistoryStatus(blobUrl, status, index)`: history Mapのstatus/indexを更新
2. `syncHistoryBadges()`: history Mapの内容をDOMに反映
   - すべての既存バッジを削除
   - history Mapを走査し、`data.index`に対応するDOM要素にバッジを作成
3. 完了/重複の場合は3秒後にstatus を 'hidden' に変更して再同期

### 履歴アイテムバッジ (`.soeji-history-badge`)

履歴アイテムの右下に表示されるアップロード状態バッジ。

| 状態 | クラス | 表示 | 色 | 自動非表示 |
|------|--------|------|-----|-----------|
| アップロード中/待機中 | `soeji-history-badge-uploading` | スピナー（回転） | 青 (#3b82f6) | なし |
| 完了 | `soeji-history-badge-success` | チェックマーク (✓) | 緑 (#22c55e) | 3秒後 |
| 重複 | `soeji-history-badge-duplicate` | チェックマーク (✓) | 黄 (#eab308) | 3秒後 |
| エラー | `soeji-history-badge-error` | エクスクラメーション (!) | 赤 (#ef4444) | なし |
| 非表示 | `soeji-history-badge-hidden` | - | - | - |

**動作仕様:**
- アップロード開始時にスピナーを表示
- 完了/重複の場合は3秒後に自動で非表示
- エラーの場合はバッジを保持（リトライを促す）
- 再アップロード実行時はスピナーから再開（既存のタイムアウトをクリア）
- アップロード中/待機中は履歴アイテムの削除ボタンを無効化

**関連メソッド:**
- `getHistoryItems()`: 履歴アイテムのDOM要素配列を取得（0番目が最新）
- `getSelectedHistoryIndex()`: 現在選択中の履歴アイテムのインデックスを取得
- `getBackgroundImageHash(element)`: 要素の`background-image`からdjb2ハッシュ値を取得
- `syncHistoryBadges()`: history MapをDOMに同期（毎回全バッジを再作成、削除ボタン状態も管理）
- `createHistoryBadge(element, state)`: 指定要素にバッジを作成
- `updateHistoryStatus(blobUrl, status, index, bgHash)`: history Mapのstatus/index/bgHashを更新し同期
- `shiftHistoryIndices(count)`: 全エントリのindexをcount分シフト
- `handleHistoryDeletion()`: 削除検出時にbgHashで突合してインデックスを修正
- `startHistoryObserver()`: 履歴コンテナの監視を開始（追加/削除検出用）

## Firefox Add-ons 対応

`manifest.json` に以下の設定が必要（Firefox 142以降）:

```json
"browser_specific_settings": {
  "gecko": {
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```
