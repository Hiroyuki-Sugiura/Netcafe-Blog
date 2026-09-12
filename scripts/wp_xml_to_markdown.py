# -*- coding: utf-8 -*-
"""
WordPress XML (WXR) to Astro Markdown Converter
WordPressのエクスポートXMLファイルから公開記事を抽出し、
AstroのContent Collections用Markdownファイルに一括変換します。
"""

import os
import sys
import re
import html
import argparse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import urlparse

# WordPress XMLのネームスペース定義
NAMESPACES = {
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'wfw': 'http://wellformedweb.org/CommentAPI/',
    'dc': 'http://purl.org/dc/elements/1.1/',
    'wp': 'http://wordpress.org/export/1.2/',
    'excerpt': 'http://wordpress.org/export/1.2/excerpt/',
}

def clean_html_to_markdown(content):
    """
    HTML文字列を簡易的・堅牢にMarkdownへ変換する
    """
    if not content:
        return ""

    text = content

    # WordPressのブロックコメントを除去 (<!-- wp:... -->, <!-- /wp:... -->)
    text = re.sub(r'<!--\s*/?wp:.*?-->', '', text)

    # 改行コードの統一
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # 見出しの変換
    for level in range(6, 0, -1):
        pattern = re.compile(rf'<h{level}[^>]*>(.*?)</h{level}>', re.DOTALL | re.IGNORECASE)
        hashes = '#' * level
        text = pattern.sub(lambda m: f"\n\n{hashes} {m.group(1).strip()}\n\n", text)

    # 太字・斜体
    text = re.sub(r'<(strong|b)[^>]*>(.*?)</\1>', r'**\2**', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<(em|i)[^>]*>(.*?)</\1>', r'*\2*', text, flags=re.DOTALL | re.IGNORECASE)

    # 引用 (blockquote)
    def blockquote_replace(m):
        inner = m.group(1).strip()
        lines = inner.split('\n')
        quoted = '\n'.join(f"> {line.strip()}" for line in lines if line.strip())
        return f"\n\n{quoted}\n\n"
    text = re.sub(r'<blockquote[^>]*>(.*?)</blockquote>', blockquote_replace, text, flags=re.DOTALL | re.IGNORECASE)

    # リンク (<a href="...">...</a>)
    def link_replace(m):
        href = m.group(1)
        label = m.group(2).strip()
        return f"[{label}]({href})"
    text = re.sub(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', link_replace, text, flags=re.DOTALL | re.IGNORECASE)

    # 画像 (<img ... src="..." ... alt="..." ...>)
    def img_replace(m):
        tag_attrs = m.group(0)
        src_m = re.search(r'src=["\']([^"\']+)["\']', tag_attrs, re.IGNORECASE)
        alt_m = re.search(r'alt=["\']([^"\']*)["\']', tag_attrs, re.IGNORECASE)
        src = src_m.group(1) if src_m else ''
        alt = alt_m.group(1) if alt_m else ''
        return f"\n\n![{alt}]({src})\n\n"
    text = re.sub(r'<img\s+[^>]*>', img_replace, text, flags=re.IGNORECASE)

    # リスト (ul, ol, li)
    def list_replace(m):
        items = re.findall(r'<li[^>]*>(.*?)</li>', m.group(1), flags=re.DOTALL | re.IGNORECASE)
        res = []
        for it in items:
            clean_it = re.sub(r'<[^>]+>', '', it).strip()
            res.append(f"- {clean_it}")
        return "\n\n" + "\n".join(res) + "\n\n"
    text = re.sub(r'<ul[^>]*>(.*?)</ul>', list_replace, text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<ol[^>]*>(.*?)</ol>', list_replace, text, flags=re.DOTALL | re.IGNORECASE)

    # 水平線 (<hr>)
    text = re.sub(r'<hr\s*/?>', '\n\n---\n\n', text, flags=re.IGNORECASE)

    # コードブロック (<pre><code>...</code></pre>)
    def code_block_replace(m):
        code_content = m.group(1)
        code_content = html.unescape(code_content)
        return f"\n\n```\n{code_content.strip()}\n```\n\n"
    text = re.sub(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', code_block_replace, text, flags=re.DOTALL | re.IGNORECASE)

    # 段落 (<p>...</p>)
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\n\1\n\n', text, flags=re.DOTALL | re.IGNORECASE)

    # 改行 (<br>)
    text = re.sub(r'<br\s*/?>', '  \n', text, flags=re.IGNORECASE)

    # HTMLエンティティのデコード
    text = html.unescape(text)

    # 余分な改行の整理
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_and_convert(xml_path, output_dir="src/content/blog", download_images=False, images_dir="public/images/posts"):
    if not os.path.exists(xml_path):
        print(f"エラー: XMLファイルが見つかりません: {xml_path}")
        return

    os.makedirs(output_dir, exist_ok=True)
    if download_images:
        os.makedirs(images_dir, exist_ok=True)

    print(f"XMLファイルを読み込み中: {xml_path}")
    tree = ET.parse(xml_path)
    root = tree.getroot()
    channel = root.find('channel')
    if channel is None:
        print("エラー: 有効なRSS/WXR形式ではありません。")
        return

    # 添付画像(attachments)のIDとURLのマッピングを作成
    attachment_map = {}
    for item in channel.findall('item'):
        post_type = item.find('wp:post_type', NAMESPACES)
        post_id = item.find('wp:post_id', NAMESPACES)
        attachment_url = item.find('wp:attachment_url', NAMESPACES)
        if post_type is not None and post_type.text == 'attachment' and post_id is not None and attachment_url is not None:
            attachment_map[post_id.text] = attachment_url.text

    # 公開記事(publish)の抽出と変換
    articles = []
    for item in channel.findall('item'):
        post_type = item.find('wp:post_type', NAMESPACES)
        status = item.find('wp:status', NAMESPACES)

        # 投稿タイプがpostで、かつ公開済みのもののみ
        if post_type is None or post_type.text != 'post':
            continue
        if status is None or status.text != 'publish':
            continue

        title_elem = item.find('title')
        title = title_elem.text if title_elem is not None and title_elem.text else "無題"

        # スラッグ
        post_name_elem = item.find('wp:post_name', NAMESPACES)
        slug = post_name_elem.text if post_name_elem is not None and post_name_elem.text else None

        # post_id
        post_id_elem = item.find('wp:post_id', NAMESPACES)
        post_id = post_id_elem.text if post_id_elem is not None else "post"

        if not slug:
            slug = f"post-{post_id}"

        # URLデコード（日本語スラッグ等の場合）
        import urllib.parse
        slug = urllib.parse.unquote(slug)
        # Windowsのファイル名禁止文字を安全に置換
        safe_filename = re.sub(r'[\\/*?:"<>|]', '-', slug).strip('-')

        # 公開日時
        post_date_elem = item.find('wp:post_date', NAMESPACES)
        post_date_str = post_date_elem.text if post_date_elem is not None else ""
        try:
            pub_date = datetime.strptime(post_date_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            pub_date = datetime.now()

        # カテゴリとタグ
        categories = []
        tags = []
        for cat in item.findall('category'):
            domain = cat.attrib.get('domain', '')
            cat_name = cat.text if cat.text else ''
            if domain == 'category':
                if cat_name and cat_name != '未分類':
                    categories.append(cat_name)
            elif domain == 'post_tag':
                if cat_name:
                    tags.append(cat_name)

        # アイキャッチ画像 (thumbnail_id)
        hero_image = ""
        for meta in item.findall('wp:postmeta', NAMESPACES):
            key = meta.find('wp:meta_key', NAMESPACES)
            val = meta.find('wp:meta_value', NAMESPACES)
            if key is not None and key.text == '_thumbnail_id' and val is not None:
                thumb_id = val.text
                if thumb_id in attachment_map:
                    hero_image = attachment_map[thumb_id]

        # 本文
        content_elem = item.find('content:encoded', NAMESPACES)
        content_html = content_elem.text if content_elem is not None and content_elem.text else ""

        # アイキャッチ画像がメタデータにない場合、本文の最初の画像を採用
        if not hero_image:
            first_img_m = re.search(r'<img\s+[^>]*src=["\']([^"\']+)["\']', content_html, re.IGNORECASE)
            if first_img_m:
                hero_image = first_img_m.group(1)

        # 本文HTMLをMarkdownに変換
        body_md = clean_html_to_markdown(content_html)

        # 抜粋/説明文（本文の先頭120文字）
        plain_text = re.sub(r'[#*`\[\]\(\)\n]', ' ', body_md).strip()
        description = plain_text[:120].strip() + ("..." if len(plain_text) > 120 else "")

        articles.append({
            'title': title,
            'slug': slug,
            'safe_filename': safe_filename,
            'pub_date': pub_date,
            'categories': categories,
            'tags': tags,
            'hero_image': hero_image,
            'description': description,
            'body': body_md,
        })

    print(f"変換対象の公開記事: {len(articles)} 件")

    # Markdownファイルへの書き込み
    for art in articles:
        date_str = art['pub_date'].strftime('%Y-%m-%d')
        filename = f"{date_str}-{art['safe_filename']}.md"
        filepath = os.path.join(output_dir, filename)

        # Frontmatterの作成
        escaped_title = art['title'].replace('"', '\\"')
        escaped_desc = art['description'].replace('"', '\\"')
        cat_list = ', '.join(f'"{c}"' for c in art['categories'])
        tag_list = ', '.join(f'"{t}"' for t in art['tags'])

        md_content = f"""---
title: "{escaped_title}"
description: "{escaped_desc}"
pubDate: "{art['pub_date'].strftime('%Y-%m-%d %H:%M:%S')}"
heroImage: "{art['hero_image']}"
tags: [{tag_list}]
categories: [{cat_list}]
slug: "{art['slug']}"
---

{art['body']}
"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(md_content)

    print(f"成功: {len(articles)} 件の記事を {output_dir} に出力しました。")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="WordPress XML to Astro Markdown")
    parser.add_argument("xml_file", help="WordPressエクスポートXMLファイルのパス")
    parser.add_argument("--output", default="src/content/blog", help="出力先ディレクトリ")
    parser.add_argument("--download-images", action="store_true", help="画像をダウンロードしてローカル保存する")
    args = parser.parse_args()

    parse_and_convert(args.xml_file, output_dir=args.output, download_images=args.download_images)
