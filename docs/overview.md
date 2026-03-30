## Slopify プロダクト完全解析

### コンセプト
**ローカルファースト・イベントソース型のコラボレーションワークスペース**。Electron デスクトップアプリが SQLite にローカル保存し、Socket.IO で Fastify サーバー（PostgreSQL）と同期。オフラインでも完全動作し、再接続時にイベントが同期される。

---

### アーキテクチャ

**モノレポ構成** (npm workspaces):
- `apps/desktop` — Electron + React (Vite) デスクトップアプリ
- `apps/sync-server` — Fastify + Socket.IO 同期サーバー
- `packages/shared` — Zod スキーマ + TypeScript 型定義

---

### イベントソーシングモデル（核心設計）

全ての状態変更は**不変のイベント**として記録される。18種類のイベントタイプ：

| カテゴリ | イベント |
|---|---|
| プロジェクト | `project.created`, `member.joined` |
| チャット | `chat.created`, `chat.renamed`, `chat.deleted` |
| メッセージ | `message.posted`, `message.edited`, `message.deleted`, `message.reaction.added`, `message.reaction.removed` |
| 意思決定 | `decision.recorded` |
| タスク | `task.created`, `task.completed`, `task.reopened` |
| ドキュメント | `doc.created`, `doc.renamed`, `doc.updated`, `doc.comment.added` |

**イベントフロー:**
1. UI操作 → イベント生成（ULID付き）
2. SQLite に `syncStatus=pending` で保存
3. Socket.IO `sync:push` でサーバーへ送信
4. サーバーが `ON CONFLICT (id) DO NOTHING` で重複排除、`server_seq`（BIGSERIAL）を付与
5. `sync:events` で他クライアントにブロードキャスト
6. 未接続クライアントは `sync:pull` で `server_seq > since` のイベントを取得

**重要な設計判断:** Pull カーソルは `server_seq`（サーバー側自動採番）を使用。クライアントの `created_at` ではない — オフラインクライアントが古いタイムスタンプのデータをpushしてもイベント欠損が起きない。

---

### データベーススキーマ

**サーバー (PostgreSQL):** users, projects, project_members, chat_channels, docs, doc_comments, tasks, decisions, events (server_seq BIGSERIAL付き), invites

**クライアント (SQLite/Drizzle):** サーバーをミラーリング + `syncStatus` カラム（0=未同期, 1=同期済）、`projectReadCursors`（既読管理）、`appMeta`（設定KV）

**冪等性:** 全ての DB 変更は `ON CONFLICT ... DO UPDATE` で安全にリトライ可能。

---

### 同期プロトコル (Socket.IO)

| イベント | 方向 | 内容 |
|---|---|---|
| `sync:push` | Client→Server | `{events[], serverAccessPassword}` → `{acceptedIds[]}` |
| `sync:pull` | Client→Server | `{projectIds[], since, password}` → `{events[], cursor}` |
| `sync:event` | Server→Client | `{projectId}` 軽量ヒント |
| `sync:events` | Server→Client | `{events[]}` 完全ペイロード |
| `presence:update` | Client→Server | `{status: "online"\|"away"}` |
| `presence:list` | Client→Server | `{projectId}` → `{presence[]}` |
| `version:outdated` | Server→Client | `{latestVersion}` |

**HTTP エンドポイント:** `GET /health`, `POST /auth/check`, `POST /invites/create`, `POST /invites/join`

認証は単一共有パスワード (`SERVER_ACCESS_PASSWORD`)。`maxHttpBufferSize` = 50MB（base64画像対応）。

---

### デスクトップアプリ構成

**Main プロセス:**
- `repository.ts` — SQLite/Drizzle によるデータ層、イベント投影エンジン（`applyProjection` switch/case）
- `ipc.ts` — 35+ の IPC ハンドラ登録
- `sync-client.ts` — Socket.IO クライアントラッパー、Promise ベース API、再接続管理
- `schema.ts` — Drizzle ORM による SQLite テーブル定義

**Renderer (React):**
- `App.tsx` (1620行) — 全UIを単一ファイルに実装
- 画面遷移: Setup → Projects → Workspace → Settings
- Zustand `store.ts` で状態管理

**Preload:** `contextBridge` で `window.desktopApi` を安全に公開（35+ メソッド）

---

### UI / 機能一覧

**ワークスペース（メイン画面）:**
- **左サイドバー:** チャンネル一覧、ドキュメント一覧、メンバー一覧（プレゼンス表示）
- **中央:** チャットビュー or ドキュメントエディタ
- **右パネル:** 決定事項パネル（リサイズ・折りたたみ可能）

**チャット機能:**
- Markdown 対応（marked + LRU キャッシュ 500件）
- 画像貼り付け（Ctrl+V / ファイルアップロード）、ライトボックス表示
- リプライスレッド（引用プレビュー付き）
- 絵文字リアクション（👍❤️😂😮😢🎉）トグル式
- メッセージ編集・削除（Shift+ホバーで表示）
- 日付セパレーター（Today / Yesterday / 日付）

**その他機能:**
- タスク管理（作成・完了トグル、チャンネル別フィルタ）
- 意思決定記録（タイトル+本文、チャンネル別）
- ドキュメント（Markdown エディタ + インラインコメント）
- グローバル検索（Ctrl+K、300ms デバウンス）
- プレゼンス（15秒ポーリング、online/away/offline）
- 通知（アプリ内 + デスクトップ、クリックで該当箇所に遷移）
- バージョン警告バナー（古いクライアント検知時）

---

### デプロイ

- **Docker Compose:** PostgreSQL 16 + Sync Server（multi-stage build、node:22-alpine）
- **CI/CD:** GitHub Actions で VPS に自動デプロイ (`docker compose up -d --build`)
- **配布ビルド:** electron-builder で Linux/Mac/Win

---

### テスト

- **E2E:** Playwright + Electron、`workers: 1`（シリアル実行）、3分タイムアウト
- 2種類: `test:e2e:ui`（Playwright クリック操作）、`test:e2e:runtime`（desktopApi 直接呼び出し）
- **Unit:** Vitest（カバレッジ付き）
