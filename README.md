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

### コンポーネント

| サービス | 説明 |
|---------|------|
| **frontend** | Vue 3 + PrimeVue製のWebUI / nginxでホスト |
| **backend** | Express製のAPI / 検索・画像情報取得のエンドポイントを提供 |
| **service** | ファイル監視サービス / PNGファイルを検知し、メタデータ抽出・DB/S3登録・インデックス作成を行う |
| **postgres** | メインデータベース / 画像情報、タグ、メタデータを保存 |
| **meilisearch** | 全文検索エンジン / タグやプロンプトでの高速検索を提供 |
| **rustfs** | S3互換オブジェクトストレージ / 画像ファイルを保存 |
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
| Adminer (DB管理) | http://localhost:8081 |
| Samba | smb://localhost/images |

### 画像の登録

画像の登録は Samba 経由で行う設計です。

- macOS の場合
   - Finderから `smb://localhost/images` に接続
- Windows の場合
   - エクスプローラーのアドレスバーに `\\localhost\images` と入力して接続
- ユーザー名: `soeji`, パスワード: `soeji`
- PNGファイルをコピー

ファイルが追加されると、 service が自動的に以下の処理を行います。

1. ファイル転送の完了を待機（PNGシグネチャの検証）
2. メタデータを抽出
3. S3にアップロード
4. DBに登録
5. Meilisearchにインデックス
6. 元ファイルを削除（設定による）

## ローカル開発

ライブリロードなどを使ってごりごり開発する場合は、コンテナではなくローカルで動かしたほうが便利です。

```bash
# 依存関係のインストール
npm install

# インフラのみ起動
docker compose up -d postgres meilisearch rustfs rustfs-setup

# DBスキーマの同期
npm run db:push -w @soeji/service

# 開発モードでまとめて起動
npm run dev
```

## プロジェクト構成

```
soeji/
├── frontend/          # Vue 3 + PrimeVue WebUI
├── backend/           # Express API
├── service/           # ファイル監視・処理サービス
│   ├── prisma/        # Prismaスキーマ
│   └── src/
│       └── services/
│           ├── watcher.ts       # ファイル監視
│           ├── imageProcessor.ts # 画像処理
│           ├── pngReader.ts     # PNGメタデータ解析
│           ├── s3Client.ts      # S3操作
│           ├── database.ts      # DB操作
│           └── meilisearchClient.ts # 検索インデックス
└── docker-compose.yml
```

## 環境変数

### service

| 変数 | デフォルト | 説明 |
|-----|-----------|------|
| `DATABASE_URL` | - | PostgreSQL接続URL |
| `MEILISEARCH_HOST` | `http://localhost:7700` | MeilisearchホストURL |
| `MEILISEARCH_API_KEY` | - | Meilisearch APIキー |
| `S3_ENDPOINT` | `http://localhost:9000` | S3エンドポイント（内部用） |
| `S3_ACCESS_KEY` | - | S3アクセスキー |
| `S3_SECRET_KEY` | - | S3シークレットキー |
| `S3_BUCKET` | `soeji-images` | S3バケット名 |
| `WATCH_DIR` | `./watch` | 監視ディレクトリ |
| `DELETE_AFTER_PROCESS` | `true` | 処理後にファイルを削除するか |

### backend

| 変数 | デフォルト | 説明 |
|-----|-----------|------|
| `DATABASE_URL` | - | PostgreSQL接続URL |
| `MEILISEARCH_HOST` | `http://localhost:7700` | MeilisearchホストURL |
| `MEILISEARCH_API_KEY` | - | Meilisearch APIキー |
| `S3_ENDPOINT` | `http://localhost:9000` | S3エンドポイント（内部用） |
| `S3_PUBLIC_ENDPOINT` | `http://localhost:9000` | S3公開エンドポイント（ブラウザから見るときのURL） |
| `S3_BUCKET` | `soeji-images` | S3バケット名 |
| `PORT` | `3000` | APIサーバーポート |

## API

### 検索

```
GET /api/search?q=検索クエリ&limit=20&offset=0
```

### タグサジェスト

```
GET /api/search/suggest?q=プレフィックス
```

### 画像一覧

```
GET /api/images?limit=20&offset=0
```

### 画像詳細

```
GET /api/images/:id
```

## ライセンス

MIT
