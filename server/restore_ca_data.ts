import * as XLSX from 'xlsx';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function restoreOriginalData() {
  const workbook = XLSX.readFile('attached_assets/Subsidies and Cut-Offs_1759427912127.xlsx');
  const worksheet = workbook.Sheets['CA'];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  
  console.log(`Found ${jsonData.length} rows in CA sheet`);
  
  let imported = 0;
  for (const row of jsonData as any[]) {
    if (!row['Subsidy Program']) continue;
    
    try {
      await sql`
        INSERT INTO subsidy_programs_curated_10_01_25 (
          country, program_name, description, hyperlink,
          funding_amount, key_objectives, additional_information,
          payment_cap, closing_date, budget_exhaustion_marker, notes_structure,
          source_sheet
        ) VALUES (
          'CA',
          ${row['Subsidy Program']},
          ${row['Description']},
          ${row['Hyperlink']},
          ${row['Funding Amount']},
          ${row['Key Objectives']},
          ${row['Additional Information']},
          ${row['Payment/Funding Cap']},
          ${row['Closing Date/Deadline']},
          ${row['Budget Exhaustion Marker']},
          ${row['Notes/Structure']},
          'CA'
        )
      `;
      imported++;
    } catch (error: any) {
      console.error(`Error importing ${row['Subsidy Program']}:`, error.message);
    }
  }
  
  console.log(`\n=== RESTORE COMPLETE ===`);
  console.log(`Restored ${imported} Canadian programs`);
  const result = await sql`SELECT COUNT(*) as total FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA'`;
  console.log(`Total in database: ${result[0].total}`);
}

restoreOriginalData().catch(console.error);
