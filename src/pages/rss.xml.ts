import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site || 'https://blog.netcafe-guide.com',
    items: posts.map((post) => {
      const pubDate = new Date(post.data.pubDate);
      const year = pubDate.getFullYear().toString();
      const month = String(pubDate.getMonth() + 1).padStart(2, '0');
      const day = String(pubDate.getDate()).padStart(2, '0');
      const slug = post.data.slug || post.id.replace(/\.[^/.]+$/, "").split("/").pop();

      return {
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.description,
        link: `/${year}/${month}/${day}/${slug}`,
      };
    }),
  });
}
