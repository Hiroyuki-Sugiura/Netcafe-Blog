import fs from 'fs';
import path from 'path';
import https from 'https';

const filename = 'XPS13全画面.png';
const url = 'https://blog.netcafe-guide.com/wp-content/uploads/2019/05/' + encodeURIComponent(filename);
const destDir = 'public/wp-content/uploads/2019/05';
const destPath = path.join(destDir, filename);

fs.mkdirSync(destDir, { recursive: true });

console.log('Downloading from:', url);
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  console.log('Status code:', res.statusCode);
  if (res.statusCode === 200) {
    const stream = fs.createWriteStream(destPath);
    res.pipe(stream);
    stream.on('finish', () => {
      console.log('Successfully saved to:', destPath);

      const blogDir = 'src/content/blog';
      for (const f of fs.readdirSync(blogDir)) {
        const p = path.join(blogDir, f);
        let c = fs.readFileSync(p, 'utf8');
        if (c.includes('XPS13全画面.png')) {
          c = c.replace(/https?:\/\/[^\s\)"']+\/XPS13全画面\.png[^\s\)"']*/g, '/wp-content/uploads/2019/05/XPS13全画面.png');
          fs.writeFileSync(p, c, 'utf8');
          console.log('Updated post:', f);
        }
      }
    });
  } else {
    console.error('Failed with status:', res.statusCode);
  }
}).on('error', console.error);
