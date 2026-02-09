# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

soejiはNovelAI（NAI）で生成されたPNG画像のメタデータを解析し、検索可能なライブラリとして管理するシステムです。ローカルネットワーク上での自己ホスティングを想定しています。

## 技術スタック

- **frontend**: Vue 3 + PrimeVue + TypeScript + PWA（Vite PWA）
- **backend**: Express + TypeScript（API + 画像処理）
- **watcher**: Node.js + TypeScript（ファイル監視のみ）
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
│   │   │   └── upload/     # アップロード関連コンポーネント
│   │   ├── composables/    # Vue Composables
│   │   ├── pages/          # ページコンポーネント
│   │   ├── router/         # Vue Router設定
│   │   ├── types/          # TypeScript型定義
│   │   └── utils/          # ユーティリティ関数
│   └── public/             # 静的ファイル・PWAアイコン
├── backend/            # Express API + 画像処理
│   ├── prisma/         # Prismaスキーマ（DBの定義）
│   │   └── migrations/ # DBマイグレーション
│   └── src/
│       ├── routes/     # APIルート
│       ├── services/   # 主要なサービスロジック
│       │   └── readers/ # メタデータリーダー
│       ├── scripts/    # 管理スクリプト
│       ├── middleware/ # 認証ミドルウェア
│       └── types/      # TypeScript型定義
├── watcher/            # ファイル監視サービス（API呼び出しのみ）
│   └── src/            # 監視ロジック
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
npm run build -w @soeji/watcher

# Prismaクライアント生成
npm run db:generate -w @soeji/backend

# DBスキーマ同期（開発用）
npm run db:push -w @soeji/backend

# DBマイグレーション（本番用）
npm run db:migrate -w @soeji/backend

# タグ再インデックス（開発用）
npm run reindex-tags:dev -w @soeji/backend

# タグ再インデックス（ビルド後）
npm run reindex-tags -w @soeji/backend

# Docker Compose（インフラのみ）
docker compose up -d postgres meilisearch rustfs rustfs-setup

# Docker Compose（全サービス）
docker compose up -d

# Converter再ビルド（Go変更時）
docker compose build converter
```

## アーキテクチャの要点

### データフロー

#### Samba経由（watcher）

```
[Samba] → [watch_data] → [watcher] → [backend /api/upload] → [S3 + PostgreSQL + Meilisearch]
```

1. Samba経由でPNGファイルが`watch_data`ボリュームに追加される
2. watcherがファイルを検知し、転送完了を待機（PNGシグネチャ検証）
3. watcherがbackend `/api/upload` APIを呼び出し
4. backendがメタデータ抽出、S3アップロード、DB登録、Meilisearchインデックスを実行
5. 元ファイルを削除

#### WebUI経由（直接アップロード）

```
[WebUI] → [backend /api/upload] → [S3 + PostgreSQL + Meilisearch]
                                → [{key}.metadata.json を S3 に保存]
```

1. admin権限ユーザーがWebUIからドラッグ＆ドロップでアップロード
2. backendが画像処理を実行（メタデータ抽出、重複チェック）
3. S3に画像とメタデータJSON（`{hash}.metadata.json`）を保存
4. DBに登録（`hasMetadataFile: true`フラグ付き）
5. Meilisearchにインデックス

### S3 URL生成

DBには`s3Key`（パス）のみを保存し、`s3Url`はAPIレスポンス時に生成する設計。
これにより`S3_PUBLIC_ENDPOINT`を変更するだけでURLを切り替え可能。

### ロスレスWebP生成

アップロード時にオリジナルPNGに加えて、ロスレスWebP版（`{hash}.lossless.webp`）を生成・保存する。
サムネイル生成時にロスレスWebPをソースとして使うことで、余計なメタデータを排除した効率的な変換が可能。

- **環境変数**: `ENABLE_LOSSLESS_WEBP`（デフォルト: `true`、`false`で無効化）
- **DBフィールド**: `hasLosslessWebp`（画像ごとにロスレスWebPの有無を記録）
- **フロントエンド**: `hasLosslessWebp=true`の場合、`?source=lossless`パラメータを付与
- **converter**: `source=lossless`の場合、`{hash}.lossless.webp`からサムネイルを生成

```typescript
// backend/src/routes/search.ts, images.ts
function buildS3Url(s3Key: string): string {
  return `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
}
```

### S3メタデータ保存

画像アップロード時に、抽出したメタデータをJSONファイルとしてS3に保存：
- ファイル名: `{hash}.metadata.json`（画像と同じハッシュ）
- インデント無し（最小サイズ）
- `hasMetadataFile`フラグでDB上で追跡（再インデックス用）

### 重複ファイル処理

- ファイルハッシュ（SHA-256）で重複検知
- 重複の場合：DB登録・S3アップロード・インデックス作成をスキップ
- ディレクトリ内のファイルは削除（設定による）

### ファイル転送待機

Samba経由の転送中にファイルを検知した場合に備え、以下を確認：
1. ファイルサイズが3回連続で安定（500ms間隔）
2. 先頭8バイトがPNGシグネチャと一致
3. 最大60秒待機、タイムアウト時はスキップ

### タグインデックス

タグサジェスト用にMeilisearchを使用。
- 50%以上がポジティブなメタデータタグ、またはユーザー作成タグのみインデックス
- `reindex-tags`スクリプトで全タグを再評価・再インデックス可能

## フロントエンド機能

### ルーティング

| パス | コンポーネント | 説明 |
|-----|---------------|------|
| `/` | `GalleryPage.vue` | メインギャラリー |
| `/gallery/:id` | `GalleryPage.vue` | 画像詳細表示 |
| `/settings` | `SettingsPage.vue` | 設定ページ |

### 画像アップロード機能

admin権限ユーザーのみ利用可能：

- **ドラッグ＆ドロップ**: 画面全体にオーバーレイ表示
- **ファイル選択**: メニューからアップロードボタン
- **並列アップロード**: 最大3並列
- **進捗表示**: XHRによるリアルタイム進捗
- **重複検知**: サーバー側でハッシュチェック
- **関連ファイル**:
  - `frontend/src/composables/useUpload.ts`
  - `frontend/src/components/upload/UploadDropZone.vue`
  - `frontend/src/components/upload/UploadQueueItem.vue`
  - `frontend/src/components/upload/UploadPanel.vue`

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
| `/api/images` | GET | 画像一覧取得 |
| `/api/images/:id` | GET | 画像詳細取得 |
| `/api/images/:id` | DELETE | 画像削除（S3 + DB + Meilisearch） |
| `/api/images/tags` | POST | 画像に一括タグ追加 |
| `/api/images/:imageId/tags/:tagId` | DELETE | 画像からタグ削除 |
| `/api/upload` | POST | 画像アップロード |
| `/api/upload/test` | GET | API Key検証（拡張機能用） |
| `/api/tags` | GET | タグ一覧・サジェスト |
| `/api/stats` | GET | 統計情報（キャッシュ付き） |
| `/api/auth/*` | - | 認証関連 |

### 統計APIキャッシュ

- **基本統計**: 5分間TTL
- **ホットタグ**: 1時間TTL

### 画像削除時の処理

1. S3から画像ファイル（`.png`）を削除
2. S3からメタデータファイル（`.metadata.json`）を削除
3. Meilisearchからドキュメントを削除
4. DBから画像レコードを削除（カスケードでImageTag、ImageMetadataも削除）
5. 影響を受けたタグのインデックスを更新

## 重要なファイル

| ファイル | 役割 |
|---------|------|
| `backend/prisma/schema.prisma` | DBスキーマ定義 |
| `backend/src/services/imageProcessor.ts` | 画像処理メインロジック |
| `backend/src/services/readers/NAIPngMetaReader.ts` | NovelAI PNGメタデータ解析 |
| `backend/src/services/readers/index.ts` | リーダー登録・検出 |
| `backend/src/services/meilisearch.ts` | 検索インデックス操作 |
| `backend/src/services/database.ts` | Prismaクライアント・DB操作 |
| `backend/src/services/s3Client.ts` | S3クライアント設定 |
| `backend/src/services/tagIndexer.ts` | タグインデックス管理 |
| `backend/src/routes/upload.ts` | アップロードAPI |
| `backend/src/routes/images.ts` | 画像CRUD API |
| `backend/src/routes/search.ts` | 検索API |
| `backend/src/routes/stats.ts` | 統計API |
| `backend/src/scripts/reindexTags.ts` | タグ再インデックススクリプト |
| `watcher/src/index.ts` | ファイル監視・API呼び出し |
| `frontend/src/App.vue` | アプリルート（PIN保護） |
| `frontend/src/pages/GalleryPage.vue` | ギャラリーページ |
| `frontend/src/pages/SettingsPage.vue` | 設定ページ |
| `frontend/src/components/ImageLightbox.vue` | 画像表示・ナビゲーション |
| `frontend/src/components/ImageGrid.vue` | グリッド表示 |
| `frontend/src/composables/usePinProtection.ts` | PIN保護ロジック |
| `frontend/src/composables/usePwaUpdate.ts` | PWA更新ロジック |
| `frontend/src/composables/useUpload.ts` | アップロードロジック |
| `frontend/src/composables/useApi.ts` | API通信 |
| `frontend/src/utils/image.ts` | 画像URL生成ユーティリティ |
| `frontend/src/types/api.ts` | API型定義 |
| `converter/main.go` | Converterエントリーポイント |
| `converter/handlers.go` | HTTPハンドラー |
| `converter/converter.go` | PNG→WebP変換ロジック |
| `cdn/templates/default.conf.template` | CDNサーバー設定（envsubstテンプレート） |

## Docker構成

| サービス | ポート | 説明 |
|---------|--------|------|
| frontend | 8080 | nginx + Vue SPA（PWA） |
| backend | 3000（内部） | Express API |
| watcher | - | ファイル監視（API呼び出しのみ） |
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
4. backend, watcher（migrate完了後）
5. converter（rustfs-setup完了後）
6. cdn（converter完了後）
7. frontend

### ビルド引数

- **frontend**: `COMMIT_HASH` - バージョン情報表示用のコミットハッシュ

## CDN・Converter アーキテクチャ

### 画像配信フロー

```
[Client] → [frontend:80] → [cdn:9080] → (認証成功) → [converter:8000] → [rustfs:9000]
                              ↓  ↑  auth_request
                  [backend:3000/api/auth/verify]
```

1. クライアントが `/images` を通ってCDN（nginx）を経由し画像をリクエスト（Cookie: soeji_auth_token付き）
2. CDNがBackendの`/api/auth/verify`に認証サブリクエストを送信
    - 認証結果は5分間キャッシュされる
3. 認証成功（200）の場合のみ処理を継続、失敗（401）の場合は401を返却
4. CDNキャッシュにヒットすれば即座に返却
5. キャッシュミス時はconverterにプロキシ
6. converterがrustfsから画像を取得
7. `Accept: image/webp` ヘッダがあればWebP変換
8. クエリパラメータでリサイズ（サムネイル生成）
9. CDNがレスポンスをキャッシュ

### CDN認証（auth_request）

- **Cookie名**: `soeji_auth_token`（JWT Access Token）
- **認証エンドポイント**: `/api/auth/verify`
- **認証キャッシュ**: 5分間（auth_cache）
- **AUTH_ENABLED=false時**: Backendが常に200を返すため認証スキップと同等
- **関連ファイル**:
  - `cdn/templates/default.conf.template`（nginx設定テンプレート）
  - `backend/src/routes/auth.ts`（verify エンドポイント）

認証Cookie発行タイミング：
- ログイン成功時（`/api/auth/login`）
- セットアップ完了時（`/api/auth/setup`）
- トークンリフレッシュ時（`/api/auth/refresh`）
- ログアウト時にCookieをクリア（`/api/auth/logout`）

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

- Prismaスキーマ変更後は`npm run db:generate -w @soeji/backend`が必要
- フロントエンドの型定義は`frontend/src/types/api.ts`で管理
- backendはS3_PUBLIC_ENDPOINTからURLを生成するため、環境変数の設定に注意
- S3_PUBLIC_ENDPOINTはCDN経由（`:9080`）を指定することで画像変換・キャッシュを利用
- converter変更時はDocker再ビルドが必要（`docker compose build converter`）
- フロントエンドはPWA対応のため、Service Worker更新時にユーザーへ通知が表示される
- watcher用の内部APIキー（`WATCHER_API_KEY`）はbackendとwatcher間、およびブラウザ拡張機能で共有

### マイグレーションファイルの作成（重要）

**Prismaスキーマ（`schema.prisma`）を変更した場合、必ずマイグレーションファイルを作成すること。**

マイグレーションファイルがないと、本番環境やDockerでのデプロイ時にスキーマが適用されない。

```bash
# 方法1: Prisma CLIで自動生成（推奨）
npm run db:migrate -w @soeji/backend -- --name <migration_name>

# 方法2: 手動作成
# backend/prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql を作成
```

**手動作成時の命名規則:**
- ディレクトリ名: `YYYYMMDDHHMMSS_<snake_case_description>`
  - 例: `20260112000000_add_has_lossless_webp`
- ファイル名: `migration.sql`

**チェックリスト:**
- [ ] `schema.prisma` にカラム/テーブル追加
- [ ] マイグレーションファイル作成
- [ ] `npm run db:generate` でPrismaクライアント再生成
- [ ] ローカルで `npm run db:push` または `npm run db:migrate` でテスト

## ブラウザ拡張機能

NovelAI（https://novelai.net）で生成した画像を直接soejiにアップロードするChrome/Firefox両対応の拡張機能。
別リポジトリ（soeji-browser-extension）に分離済み。

### CORS設定

バックエンド（`backend/src/index.ts`）で動的CORS設定を使用：
- `/api/upload`エンドポイントに対して`https://novelai.net`、`chrome-extension://`、`moz-extension://`からのリクエストを許可
- `X-Watcher-Key`ヘッダーを許可
