import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const BLOG_DIR = 'src/content/blog';
const PUBLIC_DIR = 'public';

// URLからファイルをダウンロードする関数
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(fileUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      // ディレクトリを再帰的に作成
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const req = client.get(fileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://blog.netcafe-guide.com/',
        },
        timeout: 15000,
      }, (res) => {
        // リダイレクト (301, 302) の追従
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, fileUrl).href;
          }
          return downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ステータスコード: ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('タイムアウト (15s)'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

// 同時実行数を制御するヘルパー
async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('🔍 記事中の画像URLをスキャン中...');
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));

  // 画像URLと、それが含まれるファイルの対応
  const urlMap = new Map(); // url -> Set of filePaths

  for (const f of files) {
    const filePath = path.join(BLOG_DIR, f);
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. heroImage
    const heroMatch = content.match(/heroImage:\s*["']?([^"'\n]+)["']?/);
    if (heroMatch && heroMatch[1]) {
      const u = heroMatch[1].trim();
      if (u.startsWith('http')) {
        if (!urlMap.has(u)) urlMap.set(u, new Set());
        urlMap.get(u).add(filePath);
      }
    }

    // 2. Markdown画像 ![]()
    const mdRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    let m;
    while ((m = mdRegex.exec(content)) !== null) {
      const u = m[1];
      if (!urlMap.has(u)) urlMap.set(u, new Set());
      urlMap.get(u).add(filePath);
    }

    // 3. HTML img src
    const htmlRegex = /<img\s+[^>]*src=["'](https?:\/\/[^"'\s]+)["']/gi;
    while ((m = htmlRegex.exec(content)) !== null) {
      const u = m[1];
      if (!urlMap.has(u)) urlMap.set(u, new Set());
      urlMap.get(u).add(filePath);
    }

    // 4. audio/video タグの src
    const mediaRegex = /<(?:audio|video)[^>]*src=["'](https?:\/\/[^"'\s]+)["']/gi;
    while ((m = mediaRegex.exec(content)) !== null) {
      const u = m[1];
      if (!urlMap.has(u)) urlMap.set(u, new Set());
      urlMap.get(u).add(filePath);
    }
  }

  console.log(`総画像・メディアURL件数: ${urlMap.size} 件`);

  // 旧ドメイン (blog.netcafe-guide.com) のURLを優先的に抽出
  const targets = [];
  for (const [url, fileSet] of urlMap.entries()) {
    try {
      const parsed = new URL(url);
      // 自サイトドメインの画像、またはuploadsを含むURL
      if (parsed.hostname === 'blog.netcafe-guide.com' || parsed.pathname.includes('/uploads/')) {
        // 保存先ローカルパスの決定
        // 例: /wp-content/uploads/2017/06/test.jpg -> public/wp-content/uploads/2017/06/test.jpg
        let localRelPath = parsed.pathname;
        if (localRelPath.startsWith('/')) localRelPath = localRelPath.slice(1);

        const destPath = path.join(PUBLIC_DIR, localRelPath);
        const webPath = '/' + localRelPath; // Webからアクセスするときのパス

        targets.push({ url, destPath, webPath, files: fileSet });
      }
    } catch (_) {}
  }

  console.log(`旧サーバー対象ファイル数: ${targets.length} 件`);

  if (targets.length === 0) {
    console.log('ダウンロード対象の旧サーバー画像は見つかりませんでした。');
    return;
  }

  // ダウンロード実行
  console.log(`\n📥 ${targets.length} 件のファイルをダウンロードして public/ に保存します...`);
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const successfulReplacements = new Map(); // url -> webPath

  await mapConcurrent(targets, 8, async (item, i) => {
    // すでに存在している場合はスキップ
    if (fs.existsSync(item.destPath) && fs.statSync(item.destPath).size > 0) {
      skippedCount++;
      successfulReplacements.set(item.url, item.webPath);
      return;
    }

    try {
      await downloadFile(item.url, item.destPath);
      downloadedCount++;
      successfulReplacements.set(item.url, item.webPath);
      if (downloadedCount % 20 === 0 || downloadedCount === targets.length) {
        console.log(`[進捗] ${downloadedCount}/${targets.length} 完了...`);
      }
    } catch (err) {
      failedCount++;
      console.warn(`⚠️ 失敗: ${item.url} -> ${err.message}`);
    }
  });

  console.log(`\nダウンロード結果: 成功 ${downloadedCount} 件, 既存スキップ ${skippedCount} 件, 失敗 ${failedCount} 件`);

  // Markdownファイルのパス書き換え
  console.log('\n📝 記事ファイルの画像URLをローカルパスに置換中...');
  let updatedFilesCount = 0;

  for (const f of files) {
    const filePath = path.join(BLOG_DIR, f);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    for (const [oldUrl, newPath] of successfulReplacements.entries()) {
      if (content.includes(oldUrl)) {
        content = content.replaceAll(oldUrl, newPath);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      updatedFilesCount++;
    }
  }

  console.log(`🎉 完了: ${updatedFilesCount} 個の記事ファイル内の画像パスを新サーバー（ローカル）向きに更新しました！`);
}

main().catch(console.error);
