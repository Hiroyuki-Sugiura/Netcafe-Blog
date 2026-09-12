import fs from 'fs';
import path from 'path';

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const uploadsDir = 'public/wp-content/uploads';
const blogDir = 'src/content/blog';

if (fs.existsSync(uploadsDir)) {
  const allFiles = getFiles(uploadsDir);
  const encodedFiles = allFiles.filter((f) => path.basename(f).includes('%'));

  console.log(`リネーム対象ファイル数: ${encodedFiles.length}`);
  const renameMap = new Map(); // oldWebPath -> newWebPath

  for (const oldPath of encodedFiles) {
    const dir = path.dirname(oldPath);
    const oldBase = path.basename(oldPath);
    let newBase = oldBase;
    try {
      newBase = decodeURIComponent(oldBase);
    } catch (_) {}

    // Windows禁止文字を置換
    newBase = newBase.replace(/[\\/*?:"<>|]/g, '-');

    if (newBase !== oldBase) {
      const newPath = path.join(dir, newBase);
      fs.renameSync(oldPath, newPath);

      const oldRel = oldPath.replace(/\\/g, '/').replace(/^public/, '');
      const newRel = newPath.replace(/\\/g, '/').replace(/^public/, '');
      renameMap.set(oldRel, newRel);

      // エンコードされたままのパスとデコードされたパスの両方に対応
      try {
        renameMap.set(decodeURI(oldRel), newRel);
      } catch (_) {}
    }
  }

  console.log(`リネーム完了。記事ファイル内のパスを更新中...`);

  // 記事内のパスも置換
  const blogFiles = fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'));
  let updatedPosts = 0;

  for (const f of blogFiles) {
    const p = path.join(blogDir, f);
    let content = fs.readFileSync(p, 'utf8');
    let mod = false;

    for (const [oldP, newP] of renameMap.entries()) {
      if (content.includes(oldP)) {
        content = content.replaceAll(oldP, newP);
        mod = true;
      }
    }

    if (mod) {
      fs.writeFileSync(p, content, 'utf8');
      updatedPosts++;
    }
  }

  console.log(`完了: ${updatedPosts} 個の記事ファイルを更新しました。`);
}
