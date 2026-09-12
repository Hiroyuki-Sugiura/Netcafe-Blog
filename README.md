# ネカフェ通信管理人のうわごと (Astro Blog)

AI駆動開発（Cursor / Antigravity / Claude Code等）に完全最適化されたモダンブログです。

- **URLパーマリンク**: `https://blog.netcafe-guide.com/yyyy/MM/dd/post-name` （旧WordPressのSEO被リンク完全維持）
- **フレームワーク**: Astro v5 + Tailwind CSS
- **ホスティング**: Cloudflare Pages (SSG / 転送量無料 / エッジ配信)

---

## 1. WordPressからの記事一括移行

WordPress管理画面（`ツール > エクスポート > すべてのコンテンツ`）からダウンロードしたXMLファイルをプロジェクトルートに配置し、以下のコマンドを実行します。

```bash
node scripts/wp_xml_to_markdown.mjs export.xml
```

- 公開記事（約400記事）が自動抽出され、`src/content/blog/YYYY-MM-DD-slug.md` として生成されます。
- カテゴリ、タグ、アイキャッチ画像、本文Markdown、抜粋が自動的に最適化されます。

---

## 2. ローカルでの開発 & プレビュー

```bash
# 開発サーバー起動 (ホットリロード対応)
npm run dev

# 静的ビルドのテスト
npm run build

# ビルド成果物のローカルプレビュー
npm run preview
```

---

## 3. AI駆動開発のワークフロー例

### 記事の新規作成・リライト
AIエージェントに以下のように指示するだけで、Markdown形式の記事が自動生成されます：
> 「快活CLUBの朝食無料サービスについての新着記事を、SEOを意識してMarkdownで作成して。tagsに『朝食』『無料』を入れて」

### UI・デザイン・機能の改善
> 「トップページのヘッダーに検索バーを追加して」
> 「記事詳細の目次をスクロール追従（Sticky）にして」
> 「ダークモード切り替えトグルを追加して」

Gitリポジトリ内で完結しているため、AIが直接コードを生成・テスト・コミットできます。

---

## 4. Cloudflare Pages へのデプロイ手順

1. **GitHubリポジトリの作成**:
   本プロジェクトをGitHubにプッシュします。
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Astro blog migrated from WordPress"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Cloudflare Pages との連携**:
   - Cloudflare ダッシュボード（`Workers & Pages > Create > Pages > Connect to Git`）
   - 作成したGitHubリポジトリを選択
   - ビルド設定:
     - **Framework preset**: `Astro`
     - **Build command**: `npm run build`
     - **Build output directory**: `dist`
     - **環境変数**: `NODE_VERSION` を `20` に設定

3. **カスタムドメインの設定**:
   - Cloudflare Pages のプロジェクト画面から `Custom domains` に進み、`blog.netcafe-guide.com` を追加。
   - ネームサーバーをさくらのクラウドからCloudflareに切り替えるか、既存DNSでCNAMEレコードを設定。
