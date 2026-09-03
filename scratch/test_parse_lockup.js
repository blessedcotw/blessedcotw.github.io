const fs = require('fs');
const text = fs.readFileSync('test_rendered.txt', 'utf8');

const regex = /"lockupMetadataViewModel":\{"title":\{"content":"([^"]+)"\}/g;
let match;
while ((match = regex.exec(text)) !== null) {
  const title = match[1].replace(/[\r\n]+/g, ' ');
  const start = match.index;
  const prevSnippet = text.substring(Math.max(0, start - 3000), start);
  const watchMatch = [...prevSnippet.matchAll(/\/watch\?v=([A-Za-z0-9_-]{11})/g)];
  let id = 'UNKNOWN';
  if (watchMatch.length > 0) {
    id = watchMatch[watchMatch.length - 1][1];
  }
  console.log(`${id} => ${title}`);
}
