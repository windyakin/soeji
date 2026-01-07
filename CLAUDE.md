# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

soejiはNovelAI（NAI）で生成されたPNG画像のメタデータを解析し、検索可能なライブラリとして管理するシステムです。ローカルネットワーク上での自己ホスティングを想定しています。

## 技術スタック

- **frontend**: Vue 3 + PrimeVue + TypeScript + PWA（Vite PWA）
- **backend**: Express + TypeScript
- **service**: Node.js + TypeScript（ファイル監視・処理）
- **データベース**: PostgreSQL + Prisma ORM
- **検索**: Meilisearch
- **ストレージ**: rustfs（S3互換）
- **CDN**: Nginx（キャッシュプロキシ）
- **converter**: Go（PNG→WebP変換、リサイズ）
- **ファイル共有**: Samba

## リポジトリ構造

```
soeji/
├── frontend/           # Vue 3 WebUI（PWA対応）
│   ├── src/
│   │   ├── components/     # UIコンポーネント
│   │   ├── composables/    # Vue Composables
│   │   ├── pages/          # ページコンポーネント
│   │   ├── router/         # Vue Router設定
│   │   ├── types/          # TypeScript型定義
│   │   └── utils/          # ユーティリティ関数
│   └── public/             # 静的ファイル・PWAアイコン
├── backend/            # Express API
│   └── src/routes/     # APIルート
├── service/            # ファイル監視・処理サービス
│   ├── prisma/         # Prismaスキーマ（DBの定義はここ）
│   └── src/services/   # 主要なサービスロジック
├── converter/          # Go製画像変換サービス
│   ├── main.go         # エントリーポイント
│   ├── handlers.go     # HTTPハンドラー
│   └── converter.go    # 画像変換ロジック
├── cdn/                # Nginx CDNキャッシュ設定
├── docker-compose.yml  # 全サービス定義
└── package.json        # npm workspaces設定
```

## 開発コマンド

```bash
# 依存関係インストール
npm install

# 全サービスを開発モードで起動
npm run dev

# 個別サービスのビルド
npm run build -w @soeji/frontend
npm run build -w @soeji/backend
npm run build -w @soeji/service

# Prismaクライアント生成
npm run db:generate -w @soeji/service

# DBスキーマ同期（開発用）
npm run db:push -w @soeji/service

# Docker Compose（インフラのみ）
docker compose up -d postgres meilisearch rustfs rustfs-setup

# Docker Compose（全サービス）
docker compose up -d

# Converter再ビルド（Go変更時）
docker compose build converter
```

## アーキテクチャの要点

### データフロー

1. Samba経由でPNGファイルが`watch_data`ボリュームに追加される
2. serviceがファイルを検知し、転送完了を待機（PNGシグネチャ検証）
3. PNGメタデータを抽出（プロンプト、タグ、シード等）
4. S3にアップロード、DBに登録、Meilisearchにインデックス
5. 元ファイルを削除

### S3 URL生成

DBには`s3Key`（パス）のみを保存し、`s3Url`はAPIレスポンス時に生成する設計。
これにより`S3_PUBLIC_ENDPOINT`を変更するだけでURLを切り替え可能。

```typescript
// backend/src/routes/search.ts, images.ts
function buildS3Url(s3Key: string): string {
  return `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
}
```

### 重複ファイル処理

- ファイルハッシュ（SHA-256）で重複検知
- 重複の場合：DB登録・S3アップロード・インデックス作成をスキップ
- ディレクトリ内のファイルは削除（設定による）

### ファイル転送待機

Samba経由の転送中にファイルを検知した場合に備え、以下を確認：
1. ファイルサイズが3回連続で安定（500ms間隔）
2. 先頭8バイトがPNGシグネチャと一致
3. 最大60秒待機、タイムアウト時はスキップ

### タグキャッシュ

タグサジェスト用にインメモリキャッシュを使用（5分間隔で更新）。
PostgreSQLへの負荷を軽減。

## フロントエンド機能

### ルーティング

| パス | コンポーネント | 説明 |
|-----|---------------|------|
| `/` | `GalleryPage.vue` | メインギャラリー |
| `/gallery/:id` | `GalleryPage.vue` | 画像詳細表示 |
| `/settings` | `SettingsPage.vue` | 設定ページ |

### PIN保護機能

アプリ全体にPINロックを設定可能。

- **ハッシュ方式**: SHA-256（非HTTPS環境向けフォールバック対応）
- **ロックレベル**:
  - `immediate`: 画面非表示時に即座にロック
  - `delayed`: 設定時間後にロック（1-60分）
  - `reload`: リロード時のみロック
- **ストレージ**: localStorage（`soeji-pin-*`キー）
- **関連ファイル**:
  - `frontend/src/composables/usePinProtection.ts`
  - `frontend/src/components/PinModal.vue`
  - `frontend/src/components/PinSettings.vue`

### PWA機能

- **Service Worker**: Workboxによる自動生成
- **キャッシュ戦略**:
  - 画像: CacheFirst（7日間）
  - API: NetworkOnly
  - ダウンロード（`?download=1`）: NetworkOnly
- **更新通知**: `PwaUpdatePrompt.vue`でユーザーに通知
- **関連ファイル**:
  - `frontend/src/composables/usePwaUpdate.ts`
  - `frontend/src/components/PwaUpdatePrompt.vue`
  - `frontend/vite.config.ts`（PWA設定）

### 画像表示機能

- **ライトボックス**: 画像詳細表示、キーボードナビゲーション
- **フルスクリーンモード**: ブラウザのFullscreen API使用
- **ダウンロード**: オリジナルPNGのダウンロード（`?download=1`パラメータ）

### 統計ダッシュボード

設定ページで以下の統計を表示：
- 総画像数、総タグ数
- 最古・最新画像の日付
- 直近24時間・7日間の追加画像数
- ホットタグ（最近の画像から抽出）

### バージョン情報

- **表示内容**: コミットハッシュ、ビルド日時
- **更新チェック**: Service Workerへのping
- **キャッシュクリア**: 手動クリア機能

## Backend API

### エンドポイント

| パス | メソッド | 説明 |
|-----|---------|------|
| `/api/search` | GET | 画像検索（Meilisearch） |
| `/api/images/:id` | GET | 画像詳細取得 |
| `/api/tags` | GET | タグ一覧・サジェスト |
| `/api/stats` | GET | 統計情報（キャッシュ付き） |

### 統計APIキャッシュ

- **基本統計**: 5分間TTL
- **ホットタグ**: 1時間TTL

## 重要なファイル

| ファイル | 役割 |
|---------|------|
| `service/prisma/schema.prisma` | DBスキーマ定義 |
| `service/src/services/watcher.ts` | ファイル監視・キュー処理 |
| `service/src/services/imageProcessor.ts` | 画像処理メインロジック |
| `service/src/services/pngReader.ts` | PNGメタデータ解析 |
| `service/src/services/meilisearchClient.ts` | 検索インデックス操作 |
| `service/src/services/database.ts` | Prismaクライアント設定 |
| `service/src/services/s3Client.ts` | S3クライアント設定 |
| `backend/src/routes/search.ts` | 検索API |
| `backend/src/routes/stats.ts` | 統計API |
| `frontend/src/App.vue` | アプリルート（PIN保護） |
| `frontend/src/pages/GalleryPage.vue` | ギャラリーページ |
| `frontend/src/pages/SettingsPage.vue` | 設定ページ |
| `frontend/src/components/ImageLightbox.vue` | 画像表示・ナビゲーション |
| `frontend/src/components/ImageGrid.vue` | グリッド表示 |
| `frontend/src/composables/usePinProtection.ts` | PIN保護ロジック |
| `frontend/src/composables/usePwaUpdate.ts` | PWA更新ロジック |
| `frontend/src/composables/useApi.ts` | API通信 |
| `frontend/src/utils/image.ts` | 画像URL生成ユーティリティ |
| `frontend/src/types/api.ts` | API型定義 |
| `converter/main.go` | Converterエントリーポイント |
| `converter/handlers.go` | HTTPハンドラー |
| `converter/converter.go` | PNG→WebP変換ロジック |
| `cdn/nginx.conf` | CDNキャッシュ設定 |

## Docker構成

| サービス | ポート | 説明 |
|---------|--------|------|
| frontend | 8080 | nginx + Vue SPA（PWA） |
| backend | 3000（内部） | Express API |
| service | - | ファイル監視 |
| postgres | 5432 | PostgreSQL |
| meilisearch | 7700 | 検索エンジン |
| rustfs | 9000, 9001 | S3互換ストレージ |
| cdn | 9080 | Nginx CDNキャッシュ |
| converter | 8000（内部） | PNG→WebP変換（Go） |
| samba | 445 | ファイル共有 |
| migrate | - | DB初期化（起動時のみ） |
| adminer | 8081 | DB管理UI |

### 起動順序

1. postgres（healthcheck待ち）
2. migrate（`prisma db push`実行後終了）
3. meilisearch, rustfs-setup
4. backend, service（migrate完了後）
5. converter（rustfs-setup完了後）
6. cdn（converter完了後）
7. frontend

### ビルド引数

- **frontend**: `COMMIT_HASH` - バージョン情報表示用のコミットハッシュ

## CDN・Converter アーキテクチャ

### 画像配信フロー

```
[Client] → [cdn:9080] → [converter:8000] → [rustfs:9000]
```

1. クライアントがCDN（nginx）経由で画像をリクエスト
2. CDNキャッシュにヒットすれば即座に返却
3. キャッシュミス時はconverterにプロキシ
4. converterがrustfsから画像を取得
5. Accept: image/webp ヘッダがあればWebP変換
6. クエリパラメータでリサイズ（サムネイル生成）
7. CDNがレスポンスをキャッシュ

### Converter API

```
GET /{bucket}/{key}?w=300&h=300&q=85&fit=cover
```

| パラメータ | 型 | 説明 | デフォルト |
|-----------|-----|------|-----------|
| `w` | integer | 出力幅（1-4096） | オリジナル |
| `h` | integer | 出力高さ（1-4096） | オリジナル |
| `q` | integer | WebP品質（1-100） | 85 |
| `fit` | string | cover/contain/fill | cover |

### CDNキャッシュキー

AcceptヘッダによるWebP判定をキャッシュキーに含める：

```nginx
map $http_accept $webp_suffix {
    default   "";
    "~*webp"  ".webp";
}
proxy_cache_key "$uri$is_args$args$webp_suffix";
```

同じURLでもAcceptヘッダによって異なるキャッシュエントリを持つ。

### フロントエンドでのサムネイル利用

```typescript
// frontend/src/utils/image.ts
getThumbnailUrl(s3Url, { width: 400, height: 400, fit: 'cover' })
getDownloadUrl(s3Url)  // ?download=1 を付与
```

ImageGridでは固定サイズ（400px）を使用し、キャッシュ効率を向上。

## 注意点

- Prismaスキーマ変更後は`npm run db:generate -w @soeji/service`が必要
- フロントエンドの型定義は`frontend/src/types/api.ts`で管理
- backendはS3_PUBLIC_ENDPOINTからURLを生成するため、環境変数の設定に注意
- S3_PUBLIC_ENDPOINTはCDN経由（`:9080`）を指定することで画像変換・キャッシュを利用
- converter変更時はDocker再ビルドが必要（`docker compose build converter`）
- フロントエンドはPWA対応のため、Service Worker更新時にユーザーへ通知が表示される
