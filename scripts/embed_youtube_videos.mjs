import fs from 'fs';
import path from 'path';

const dir = 'src/content/blog';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

// YouTube動画ID抽出用正規表現
const ytVideoRegex = /(?:https?|httpa):\/\/(?:www\.|jp\.)?(?:youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

// プレイリスト抽出用正規表現
const ytPlaylistRegex = /(?:https?|httpa):\/\/(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/i;

// 単独行の動画URL
const singleLineVideoUrl = /^(?:https?|httpa):\/\/(?:www\.|jp\.)?(?:youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?$/i;

// 単独行のMarkdownリンク
const singleLineMarkdownLink = /^\[.*?\]\((?:https?|httpa):\/\/(?:www\.|jp\.)?(?:youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s\)]*)?\)$/i;

// 単独行のプレイリストURL
const singleLinePlaylist = /^(?:https?|httpa):\/\/(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)(?:[^\s]*)?$/i;

// 旧Flash <object>タグ
const flashObjectRegex = /<object[^>]*>[\s\S]*?youtube\.com\/v\/([a-zA-Z0-9_-]{11})[\s\S]*?<\/object>/gi;

function generateIframe(videoId) {
  return `<div class="aspect-video my-6 rounded-xl overflow-hidden shadow-md">
  <iframe
    class="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/${videoId}"
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    loading="lazy"
    allowfullscreen>
  </iframe>
</div>`;
}

function generatePlaylistIframe(playlistId) {
  return `<div class="aspect-video my-6 rounded-xl overflow-hidden shadow-md">
  <iframe
    class="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/videoseries?list=${playlistId}"
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    loading="lazy"
    allowfullscreen>
  </iframe>
</div>`;
}

let modifiedFiles = 0;
let totalReplaced = 0;

for (const f of files) {
  const filePath = path.join(dir, f);
  const content = fs.readFileSync(filePath, 'utf8');

  // frontmatter と本文を分割（frontmatterのdescription内URLを壊さないため）
  const parts = content.split('---');
  if (parts.length < 3) continue;

  const header = parts[1];
  let body = parts.slice(2).join('---');
  const originalBody = body;

  // 1. 旧Flash <object> の置換
  body = body.replace(flashObjectRegex, (_, videoId) => {
    totalReplaced++;
    return generateIframe(videoId);
  });

  // 2. 行ごとの単独URL / Markdownリンク / プレイリストの置換
  const lines = body.split('\n');
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (singleLineVideoUrl.test(trimmed)) {
      const match = trimmed.match(singleLineVideoUrl);
      totalReplaced++;
      newLines.push(generateIframe(match[1]));
    } else if (singleLineMarkdownLink.test(trimmed)) {
      const match = trimmed.match(singleLineMarkdownLink);
      totalReplaced++;
      newLines.push(generateIframe(match[1]));
    } else if (singleLinePlaylist.test(trimmed)) {
      const match = trimmed.match(singleLinePlaylist);
      totalReplaced++;
      newLines.push(generatePlaylistIframe(match[1]));
    } else {
      newLines.push(line);
    }
  }

  body = newLines.join('\n');

  if (body !== originalBody) {
    const newContent = `---${header}---${body}`;
    fs.writeFileSync(filePath, newContent, 'utf8');
    modifiedFiles++;
  }
}

console.log(`🎉 完了: ${modifiedFiles} 個の記事ファイルで合計 ${totalReplaced} 件のYouTubeリンクを埋め込みコード（iframe）に変換しました！`);
