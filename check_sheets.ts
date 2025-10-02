import pkg from 'xlsx';
const XLSX = pkg;

const workbook = XLSX.readFile('attached_assets/Subsidies and Cut-Offs_1759424343837.xlsx');

console.log('📋 ALL SHEETS IN WORKBOOK:');
console.log('='.repeat(80));
workbook.SheetNames.forEach((sheetName, i) => {
  console.log(`\nSheet ${i + 1}: "${sheetName}"`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log(`  Rows: ${data.length}`);
  console.log(`  Columns: ${Object.keys(data[0] || {}).join(', ')}`);
  
  if (sheetName.toLowerCase().includes('source') || sheetName.toLowerCase().includes('resource') || sheetName.toLowerCase().includes('list')) {
    console.log('\n  ⭐ THIS LOOKS LIKE THE SOURCE LIST! First 5 rows:');
    data.slice(0, 5).forEach((row: any, j: number) => {
      console.log(`\n  Row ${j + 1}:`);
      Object.entries(row).forEach(([key, val]) => {
        console.log(`    ${key}: ${val}`);
      });
    });
  }
});
