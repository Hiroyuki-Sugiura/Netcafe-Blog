import fs from 'fs';
import path from 'path';

const dir = 'src/content/blog';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

let modifiedFiles = 0;
let totalReplacements = 0;

for (const f of files) {
  const filePath = path.join(dir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // 1. [adinserter ...] の完全削除
  content = content.replace(/\[\/?adinserter(?:\s+[^\]\n]*)?\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 2. [slideshow_deploy ...] の完全削除
  content = content.replace(/\[\/?slideshow_deploy(?:\s+[^\]\n]*)?\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 3. [caption id=...] と [/caption] のタグのみ削除（中身の画像・テキストは保持）
  content = content.replace(/\[caption(?:\s+[^\]\n]*)?\]/gi, () => {
    totalReplacements++;
    return '';
  });
  content = content.replace(/\[\/caption\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 4. [audio mp3=...] を HTML5 audio タグへ置換（再生可能にする）
  content = content.replace(/\[audio\s+mp3=["']([^"']+)["']\s*\](?:\[\/audio\])?/gi, (_, url) => {
    totalReplacements++;
    return `\n\n<audio controls src="${url}" class="my-4 w-full"></audio>\n\n`;
  });
  content = content.replace(/\[\/audio\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 5. [video ... mp4=...] を HTML5 video タグへ置換
  content = content.replace(/\[video(?:\s+[^\]\n]*?)?mp4=["']([^"']+)["'](?:\s+[^\]\n]*?)?\](?:\[\/video\])?/gi, (_, url) => {
    totalReplacements++;
    return `\n\n<video controls src="${url}" class="my-4 max-w-full rounded-lg"></video>\n\n`;
  });
  content = content.replace(/\[\/video\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 6. 一般的なWordPressプラグインショートコードの除去
  content = content.replace(/\[\/?(?:gallery|contact-form(?:-7)?|bzb_[a-zA-Z0-9_]+|su_[a-zA-Z0-9_]+|table|smartslider3)(?:\s+[^\]\n]*)?\]/gi, () => {
    totalReplacements++;
    return '';
  });

  // 7. ネストされたリンク記法の修正 [NuAns NEO [Reloaded]](url) -> [NuAns NEO Reloaded](url)
  content = content.replace(/\[NuAns NEO \[Reloaded\]\]\((https?:\/\/[^\)]+)\)/g, () => {
    totalReplacements++;
    return '[NuAns NEO Reloaded]($1)';
  });

  // 連続空行の整理（3行以上を2行に）
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedFiles++;
  }
}

console.log(`処理完了: ${modifiedFiles} 個のファイルを更新しました（合計 ${totalReplacements} 箇所のタグを処理）。`);
