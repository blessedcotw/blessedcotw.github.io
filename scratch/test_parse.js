const fs = require('fs');
const text = fs.readFileSync('test_rendered.txt', 'utf8');

const idRegex = /"videoId":"([A-Za-z0-9_-]{11})"/g;
const ids = [...new Set([...text.matchAll(idRegex)].map(m => m[1]))];

console.log("Found unique video IDs:", ids);

ids.forEach(id => {
  const idx = text.indexOf(id);
  console.log(`\n--- CONTEXT FOR ${id} ---`);
  console.log(text.substring(idx - 100, idx + 400));
});
