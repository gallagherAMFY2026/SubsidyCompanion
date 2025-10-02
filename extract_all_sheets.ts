import pkg from 'xlsx';
const XLSX = pkg;
import * as fs from 'fs';

const workbook = XLSX.readFile('attached_assets/Subsidies and Cut-Offs_1759424343837.xlsx');

const allData: any = {};

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  allData[sheetName] = data;
  console.log(`✅ ${sheetName}: ${data.length} rows`);
});

fs.writeFileSync('all_spreadsheet_data.json', JSON.stringify(allData, null, 2));
console.log('\n✅ All sheets exported to all_spreadsheet_data.json');
