const fs = require('fs');
const text = fs.readFileSync('test_rendered.txt', 'utf8');

const regex = /"lockupMetadataViewModel":\{"title":\{"content":"([^"]+)"\}/g;
let match;
const monthsMap = {
  'Januari': 0, 'Februari': 1, 'Maret': 2, 'April': 3, 'Mei': 4, 'Juni': 5,
  'Juli': 6, 'Agustus': 7, 'September': 8, 'Oktober': 9, 'November': 10, 'Desember': 11
};

while ((match = regex.exec(text)) !== null) {
  const rawTitle = match[1].replace(/[\r\n]+/g, ' ').trim();
  const start = match.index;
  const prevSnippet = text.substring(Math.max(0, start - 3000), start);
  const watchMatch = [...prevSnippet.matchAll(/\/watch\?v=([A-Za-z0-9_-]{11})/g)];
  if (watchMatch.length > 0) {
    const id = watchMatch[watchMatch.length - 1][1];
    let pubDate = new Date();
    
    // Parse Indonesian date from title if present (e.g., "18 Agustus 2026")
    const dateMatch = rawTitle.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const monthStr = dateMatch[2];
      const year = parseInt(dateMatch[3], 10);
      const monthIdx = monthsMap[monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase()];
      if (monthIdx !== undefined) {
        pubDate = new Date(Date.UTC(year, monthIdx, day, 0, 0, 0));
      }
    }
    console.log(`${id} => ${pubDate.toISOString().split('T')[0]} | ${rawTitle}`);
  }
}
