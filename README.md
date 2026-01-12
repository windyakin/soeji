# soeji

NAI で作った PNG画像のメタデータを解析し、検索可能なライブラリとして管理するシステム。

基本的にローカルネットワーク上での自己ホスティングを想定しています。

## 機能

- PNG画像のメタデータ自動抽出
   - NAI only
- タグの重み付け情報の解析
- 全文検索（Meilisearch）
- タグサジェスト機能
- 画像のS3互換ストレージへの保存
- ファイル監視による自動登録
- Samba経由でのファイル共有
- WebUIからのドラッグ＆ドロップアップロード（admin権限）
- PNG→WebP自動変換（Accept: image/webp対応）
- サムネイル生成（リサイズ・クロップ）
- CDNキャッシュによる高速配信

### コンポーネント

| サービス | 説明 |
|---------|------|
| **frontend** | Vue 3 + PrimeVue製のWebUI / nginxでホスト |
| **backend** | Express製のAPI / 画像処理・検索・画像情報取得のエンドポイントを提供 |
| **watcher** | ファイル監視サービス / PNGファイルを検知し、backend APIを呼び出す |
| **postgres** | メインデータベース / 画像情報、タグ、メタデータを保存 |
| **meilisearch** | 全文検索エンジン / タグやプロンプトでの高速検索を提供 |
| **rustfs** | S3互換オブジェクトストレージ / 画像ファイルを保存 |
| **cdn** | Nginx CDN / 画像キャッシュ・配信最適化 |
| **converter** | Go製画像変換 / PNG→WebP変換・サムネイル生成 |
| **samba** | ファイル共有 / watchディレクトリをネットワーク共有 |
| **migrate** | DBマイグレーション専用コンテナ / 起動時にスキーマを同期 |

## セットアップ

### 必要条件

- Docker & Docker Compose
- Node.js 24+ (ローカル開発時)

### Docker Composeで起動

```bash
# すべてのサービスを起動
docker compose up -d

# ログを確認
docker compose logs -f
```

### アクセス

| サービス | URL |
|---------|-----|
| WebUI (frontend) | http://localhost:8080 |
| API (backend) | http://localhost:8080/api |
| Meilisearch | http://localhost:7700 |
| S3 (rustfs) | http://localhost:9000 |
| S3 Console | http://localhost:9001 |
| CDN（画像配信） | http://localhost:9080 |
| Adminer (DB管理) | http://localhost:8081 |
| Samba | smb://localhost/images |

### 画像の登録

画像の登録方法は2つあります。

#### 1. Samba 経由（自動登録）

- macOS の場合
   - Finderから `smb://localhost/images` に接続
- Windows の場合
   - エクスプローラーのアドレスバーに `\\localhost\images` と入力して接続
- ユーザー名: `soeji`, パスワード: `soeji`
- PNGファイルをコピー

ファイルが追加されると、watcher が自動的に以下の処理を行います。

1. ファイル転送の完了を待機（PNGシグネチャの検証）
2. backend `/api/upload` APIを呼び出し
3. backendがメタデータ抽出・S3アップロード・DB登録・インデックス作成
4. 元ファイルを削除（設定による）

#### 2. WebUI 経由（ドラッグ＆ドロップ）

admin権限を持つユーザーは、WebUIから直接画像をアップロードできます。

1. WebUIにログイン
2. 画面上にPNGファイルをドラッグ＆ドロップ、またはメニューからアップロードボタンをクリック
3. 進捗表示付きで最大3並列でアップロード
4. 重複ファイルは自動的にスキップ

## ローカル開発

ライブリロードなどを使ってごりごり開発する場合は、コンテナではなくローカルで動かしたほうが便利です。

```bash
# 依存関係のインストール
npm install

# インフラのみ起動
docker compose up -d postgres meilisearch rustfs rustfs-setup cdn samba converter adminer

# DBスキーマの同期
npm run db:push -w @soeji/backend

# 開発モードでまとめて起動
npm run dev
```

## プロジェクト構成

```
soeji/
├── frontend/          # Vue 3 + PrimeVue WebUI
├── backend/           # Express API + 画像処理
│   ├── prisma/        # Prismaスキーマ・マイグレーション
│   └── src/
│       ├── routes/    # APIルート
│       ├── services/  # 主要なサービスロジック
│       └── scripts/   # 管理スクリプト
├── watcher/           # ファイル監視サービス（API呼び出しのみ）
│   └── src/           # 監視ロジック
├── converter/         # Go製画像変換サービス
├── cdn/               # Nginx CDN設定
└── docker-compose.yml
```

## 環境変数

### backend

| 変数 | デフォルト | 説明 |
|-----|-----------|------|
| `DATABASE_URL` | - | PostgreSQL接続URL |
| `MEILISEARCH_HOST` | `http://localhost:7700` | MeilisearchホストURL |
| `MEILISEARCH_API_KEY` | - | Meilisearch APIキー |
| `S3_ENDPOINT` | `http://localhost:9000` | S3エンドポイント（内部用） |
| `S3_PUBLIC_ENDPOINT` | `http://localhost:9080` | S3公開エンドポイント（CDN経由推奨） |
| `S3_ACCESS_KEY` | - | S3アクセスキー |
| `S3_SECRET_KEY` | - | S3シークレットキー |
| `S3_BUCKET` | `soeji-images` | S3バケット名 |
| `PORT` | `3000` | APIサーバーポート |
| `WATCHER_API_KEY` | - | watcher用内部APIキー |
| `ENABLE_LOSSLESS_WEBP` | `true` | アップロード時にロスレスWebP版を生成するか（`false`で無効化） |

> [!NOTE]
> `ENABLE_LOSSLESS_WEBP` は有効化すると、アップロード時にロスレス WebP を S3 上に保存します。
> オリジナル画像と併せて保存するので、ディスク容量を多く消費しますが（+70%ぐらい）、 converter から取得する際の転送量を削減し、変換スピードを改善することができます。

### watcher

| 変数 | デフォルト | 説明 |
|-----|-----------|------|
| `BACKEND_URL` | `http://localhost:3000` | backend APIのURL |
| `WATCHER_API_KEY` | - | backend認証用APIキー |
| `WATCH_DIR` | `./watch` | 監視ディレクトリ |
| `DELETE_AFTER_PROCESS` | `true` | 処理後にファイルを削除するか |

### converter

| 変数 | デフォルト | 説明 |
|-----|-----------|------|
| `CONVERTER_PORT` | `8000` | converterのリッスンポート |
| `S3_ENDPOINT` | `http://rustfs:9000` | S3エンドポイント |
| `S3_ACCESS_KEY` | `rustfsadmin` | S3アクセスキー |
| `S3_SECRET_KEY` | `rustfsadmin` | S3シークレットキー |
| `WEBP_DEFAULT_QUALITY` | `85` | WebPデフォルト品質 |
| `MAX_DIMENSION` | `4096` | 最大出力サイズ（px） |

## 画像配信

CDN（nginx）とconverter（Go）により、画像は自動的に最適化されて配信されます。

### 配信フロー

```
[Browser] → [cdn:9080] → [converter:8000] → [rustfs:9000]
              ↓ (キャッシュ)
           [nginx cache]
```

1. ブラウザがCDN経由で画像をリクエスト
2. CDNキャッシュにヒットすれば即座に返却
3. キャッシュミス時はconverterにプロキシ
4. converterがrustfsから画像を取得し変換
5. CDNがレスポンスをキャッシュ

### サムネイル生成

```
GET http://localhost:9080/soeji-images/{hash}.png?w=400&h=400&fit=cover
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `w` | integer | 出力幅（1-4096） | オリジナル |
| `h` | integer | 出力高さ（1-4096） | オリジナル |
| `q` | integer | WebP品質（1-100） | 85 |
| `fit` | string | cover / contain / fill | cover |

### WebP自動変換

`Accept: image/webp` ヘッダを含むリクエストに対して、自動的にWebP形式で返却します。
モダンブラウザでは自動的にWebPが配信され、帯域を削減できます。

## API

### 画像アップロード

```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Required (admin only) または X-Watcher-Key ヘッダ

Response:
{
  "success": true,
  "image": { "id", "filename", "s3Url", "width", "height", "metadataFormat", "createdAt" }
}

または重複時:
{
  "success": true,
  "duplicate": true,
  "existingImage": { "id", "filename", "s3Url" }
}
```

### 検索

```
GET /api/search?q=検索クエリ&limit=20&offset=0
```

### タグサジェスト

```
GET /api/tags/suggest?q=プレフィックス
```

### 画像一覧

```
GET /api/images?limit=20&offset=0
```

### 画像詳細

```
GET /api/images/:id
```

### 画像削除

```
DELETE /api/images/:id
Authorization: Required (admin/user)
```

### タグ追加（一括）

```
POST /api/images/tags
Authorization: Required (admin/user)
Body: { "imageIds": ["id1", "id2"], "tags": ["tag1", "tag2"] }
```

### タグ削除

```
DELETE /api/images/:imageId/tags/:tagId
Authorization: Required (admin/user)
```

## ライセンス

MIT
