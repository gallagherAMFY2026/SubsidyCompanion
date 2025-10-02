import pkg from 'xlsx';
const XLSX = pkg;
import * as fs from 'fs';

const workbook = XLSX.readFile('attached_assets/Subsidies and Cut-Offs_1759424343837.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('📊 SPREADSHEET ANALYSIS');
console.log('='.repeat(80));
console.log(`Total rows: ${data.length}`);
console.log(`Sheet name: ${sheetName}`);
console.log(`Columns: ${Object.keys(data[0] || {}).join(', ')}`);
console.log('\n' + '-'.repeat(80));
console.log('ALL ROWS:');
console.log('-'.repeat(80));

data.forEach((row: any, i: number) => {
  console.log(`\nRow ${i + 1}:`);
  Object.entries(row).forEach(([key, val]) => {
    console.log(`  ${key}: ${val}`);
  });
});

console.log('\n' + '-'.repeat(80));
console.log(`✅ Full data (${data.length} rows) saved to spreadsheet_data.json`);
console.log('-'.repeat(80));

fs.writeFileSync('spreadsheet_data.json', JSON.stringify(data, null, 2));
