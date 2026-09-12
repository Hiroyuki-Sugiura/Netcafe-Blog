// WordPress XML (WXR) to Astro Markdown Converter (Node.js版)
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

function htmlToMarkdown(html) {
  if (!html) return '';

  let text = String(html);

  // WordPressのブロックコメントを除去
  text = text.replace(/<!--\s*\/?wp:.*?-->/g, '');

  // WordPressのショートコード・無効なプラグインタグを除去・変換
  text = text.replace(/\[\/?(?:adinserter|slideshow_deploy|gallery|contact-form(?:-7)?|bzb_[a-zA-Z0-9_]+|su_[a-zA-Z0-9_]+|table|smartslider3)(?:\s+[^\]\n]*)?\]/gi, '');
  text = text.replace(/\[caption(?:\s+[^\]\n]*)?\]/gi, '');
  text = text.replace(/\[\/caption\]/gi, '');
  text = text.replace(/\[audio\s+mp3=["']([^"']+)["']\s*\](?:\[\/audio\])?/gi, '\n\n<audio controls src="$1" class="my-4 w-full"></audio>\n\n');
  text = text.replace(/\[\/audio\]/gi, '');
  text = text.replace(/\[video(?:\s+[^\]\n]*?)?mp4=["']([^"']+)["'](?:\s+[^\]\n]*?)?\](?:\[\/video\])?/gi, '\n\n<video controls src="$1" class="my-4 max-w-full rounded-lg"></video>\n\n');
  text = text.replace(/\[\/video\]/gi, '');

  // 改行コード統一
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 見出し h1 - h6
  for (let level = 6; level >= 1; level--) {
    const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
    const hashes = '#'.repeat(level);
    text = text.replace(re, (_, content) => `\n\n${hashes} ${content.trim()}\n\n`);
  }

  // 太字・斜体
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // 引用 blockquote
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = content.trim().split('\n');
    return '\n\n' + lines.map(l => `> ${l.trim()}`).join('\n') + '\n\n';
  });

  // リンク
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // 画像
  text = text.replace(/<img\s+[^>]*>/gi, (match) => {
    const srcMatch = match.match(/src=["']([^"']+)["']/i);
    const altMatch = match.match(/alt=["']([^"']*)["']/i);
    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';
    return `\n\n![${alt}](${src})\n\n`;
  });

  // リスト ul / ol
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, listContent) => {
    const items = listContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    const formatted = items.map(it => `- ${it.replace(/<[^>]+>/g, '').trim()}`).join('\n');
    return '\n\n' + formatted + '\n\n';
  });
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, listContent) => {
    const items = listContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    const formatted = items.map((it, idx) => `${idx + 1}. ${it.replace(/<[^>]+>/g, '').trim()}`).join('\n');
    return '\n\n' + formatted + '\n\n';
  });

  // 水平線
  text = text.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // コードブロック
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${code.trim()}\n\`\`\`\n\n`;
  });

  // 段落
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');

  // 改行
  text = text.replace(/<br\s*\/?>/gi, '  \n');

  // 不要なHTMLタグをある程度除去
  text = text.replace(/<\/?(?:span|div|section|article)[^>]*>/gi, '');

  // HTMLエンティティの簡易デコード
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 連続空行の正規化
  text = text.replace(/\n{3,}/g, '\n\n');

  // YouTubeリンクの埋め込み変換
  text = text.replace(/<object[^>]*>[\s\S]*?youtube\.com\/v\/([a-zA-Z0-9_-]{11})[\s\S]*?<\/object>/gi, (_, id) => {
    return `\n\n<div class="aspect-video my-6 rounded-xl overflow-hidden shadow-md"><iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen></iframe></div>\n\n`;
  });

  const lines = text.split('\n');
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:https?|httpa):\/\/(?:www\.|jp\.)?(?:youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?$/i) ||
                  trimmed.match(/^\[.*?\]\((?:https?|httpa):\/\/(?:www\.|jp\.)?(?:youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s\)]*)?\)$/i);
    if (match) {
      return `<div class="aspect-video my-6 rounded-xl overflow-hidden shadow-md"><iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${match[1]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" loading="lazy" allowfullscreen></iframe></div>`;
    }
    return line;
  });
  text = processedLines.join('\n');

  return text.trim();
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('使用法: node scripts/wp_xml_to_markdown.mjs <WordPressのエクスポートXMLファイルパス>');
    process.exit(1);
  }

  const xmlPath = path.resolve(args[0]);
  if (!fs.existsSync(xmlPath)) {
    console.error(`エラー: ファイルが存在しません: ${xmlPath}`);
    process.exit(1);
  }

  const outputDir = path.resolve('src/content/blog');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`XMLファイルを読み込み中: ${xmlPath}`);
  const xmlData = fs.readFileSync(xmlPath, 'utf8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => ['item', 'category', 'wp:postmeta'].includes(name),
  });

  const parsed = parser.parse(xmlData);
  const channel = parsed.rss?.channel;
  if (!channel || !channel.item) {
    console.error('エラー: 有効なWordPress WXR形式ではありません。');
    process.exit(1);
  }

  // 添付画像 attachment のマッピング作成
  const attachmentMap = new Map();
  for (const item of channel.item) {
    const postType = item['wp:post_type'];
    const postId = item['wp:post_id'];
    const attachmentUrl = item['wp:attachment_url'];
    if (postType === 'attachment' && postId && attachmentUrl) {
      attachmentMap.set(String(postId), String(attachmentUrl));
    }
  }

  // 公開記事の抽出
  let convertedCount = 0;
  for (const item of channel.item) {
    const postType = item['wp:post_type'];
    const status = item['wp:status'];

    if (postType !== 'post' || status !== 'publish') {
      continue;
    }

    const title = item.title ? String(item.title) : '無題';
    let slug = item['wp:post_name'] ? String(item['wp:post_name']) : '';
    const postId = item['wp:post_id'] ? String(item['wp:post_id']) : `${Date.now()}`;

    try {
      slug = decodeURIComponent(slug);
    } catch (_) {}

    if (!slug) {
      slug = `post-${postId}`;
    }

    // ファイル名安全化
    const safeFilename = slug.replace(/[\\/*?:"<>|]/g, '-').replace(/^-+|-+$/g, '');

    // 公開日
    const postDateStr = item['wp:post_date'] ? String(item['wp:post_date']) : '';
    let pubDate = new Date();
    if (postDateStr) {
      const d = new Date(postDateStr.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        pubDate = d;
      }
    }

    // カテゴリとタグ
    const categories = [];
    const tags = [];
    if (Array.isArray(item.category)) {
      for (const cat of item.category) {
        const domain = cat['@_domain'];
        const name = typeof cat === 'object' ? cat['#text'] : String(cat);
        if (!name) continue;
        if (domain === 'category' && name !== '未分類') {
          categories.push(name);
        } else if (domain === 'post_tag') {
          tags.push(name);
        }
      }
    }

    // アイキャッチ画像
    let heroImage = '';
    if (Array.isArray(item['wp:postmeta'])) {
      for (const meta of item['wp:postmeta']) {
        if (meta['wp:meta_key'] === '_thumbnail_id' && meta['wp:meta_value']) {
          const thumbId = String(meta['wp:meta_value']);
          if (attachmentMap.has(thumbId)) {
            heroImage = attachmentMap.get(thumbId);
          }
        }
      }
    }

    // 本文
    const contentHtml = item['content:encoded'] ? String(item['content:encoded']) : '';
    if (!heroImage) {
      const firstImg = contentHtml.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
      if (firstImg) {
        heroImage = firstImg[1];
      }
    }

    const bodyMd = htmlToMarkdown(contentHtml);

    // 概要
    const plainText = bodyMd.replace(/[#*`\[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim();
    const description = plainText.slice(0, 120) + (plainText.length > 120 ? '...' : '');

    // 日付文字列
    const year = pubDate.getFullYear();
    const month = String(pubDate.getMonth() + 1).padStart(2, '0');
    const day = String(pubDate.getDate()).padStart(2, '0');
    const dateFormatted = `${year}-${month}-${day}`;

    const filename = `${dateFormatted}-${safeFilename}.md`;
    const filePath = path.join(outputDir, filename);

    const frontmatter = `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
pubDate: "${dateFormatted}"
heroImage: ${JSON.stringify(heroImage)}
tags: ${JSON.stringify(tags)}
categories: ${JSON.stringify(categories)}
slug: ${JSON.stringify(slug)}
---

${bodyMd}
`;

    fs.writeFileSync(filePath, frontmatter, 'utf8');
    convertedCount++;
  }

  console.log(`\n🎉 変換完了！`);
  console.log(`合計 ${convertedCount} 件の記事を ${outputDir} に出力しました。`);
  console.log(`確認用コマンド: npm run dev または npm run build`);
}

run().catch(console.error);
