const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
module.exports = function fixtures() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Name', 'Value'], ['Abe', 42], ['<script>never run</script>', 3]]), 'First');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Second sheet']]), 'Second');
  function pdf(count, width, height) {
    let result = '%PDF-1.4\n'; const offsets = [0];
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    for (let i = 0; i < count; i++) {
      const stream = `BT /F1 18 Tf 30 ${height - 50} Td (YHWH PDF preview - page ${i + 1}) Tj ET`;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }
    objects.forEach((body, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = Buffer.byteLength(result), size = objects.length + 1;
    result += `xref\n0 ${size}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(result);
  }
  const wav = Buffer.alloc(44 + 800); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(800, 40); wav.fill(128, 44);
  return {
    'preview.pdf': pdf(1, 300, 180),
    'scroll.pdf': pdf(8, 612, 792),
    'preview.xlsx': XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
    'preview.xls': XLSX.write(book, { type: 'buffer', bookType: 'xls' }),
    'preview.ods': XLSX.write(book, { type: 'buffer', bookType: 'ods' }),
    'preview.csv': Buffer.from('Name,Value\r\n"Abe, Jr.","two\nlines"\r\n"<img src=x onerror=alert(1)>",42\r\n'),
    'preview.tsv': Buffer.from('Name\tValue\nAbe\t42\n'),
    'preview.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'),
    'preview.wav': wav,
    'preview.webm': fs.readFileSync(path.join(__dirname, 'fixtures/preview.webm')),
  };
};
