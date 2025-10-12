import * as XLSX from 'xlsx';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function restoreCanadaPrograms() {
  const workbook = XLSX.readFile('attached_assets/Subsidies and Cut-Offs_1760312462040.xlsx');
  const worksheet = workbook.Sheets['CA'];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  
  console.log(`Found ${jsonData.length} rows in CA sheet`);
  
  let imported = 0;
  for (const row of jsonData as any[]) {
    const programName = row['Subsidy Program'];
    if (!programName || programName.trim() === '') continue;
    
    try {
      await sql`
        INSERT INTO subsidy_programs_curated_10_01_25 (
          country, program_name, description, hyperlink,
          funding_amount, key_objectives, additional_information,
          payment_cap, closing_date, budget_exhaustion_marker, notes_structure,
          eligibility_cutoffs, acreage_production_limit, application_deadline,
          source_sheet
        ) VALUES (
          'CA',
          ${programName},
          ${row['Description']},
          ${row['Hyperlink']},
          ${row['Funding Amount']},
          ${row['Key Objectives']},
          ${row['Additional Information']},
          ${row['Payment/Funding Cap']},
          ${row['Deadlines']},
          ${row['Budget Exhaustion Marker']},
          ${row['Notes/Structure']},
          ${row['Eligibility']},
          ${row['Production Eligibility']},
          ${row['Deadlines']},
          'CA'
        )
      `;
      imported++;
      if (imported % 50 === 0) {
        console.log(`Imported ${imported} programs...`);
      }
    } catch (error: any) {
      console.error(`Error importing ${programName}:`, error.message);
    }
  }
  
  console.log(`\n=== RESTORE COMPLETE ===`);
  console.log(`Restored ${imported} Canadian programs`);
  
  // Get statistics
  const result = await sql`SELECT COUNT(*) as total FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA'`;
  const withFunding = await sql`SELECT COUNT(*) as count FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA' AND funding_amount IS NOT NULL AND funding_amount != ''`;
  const withLinks = await sql`SELECT COUNT(*) as count FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA' AND hyperlink IS NOT NULL AND hyperlink != ''`;
  const withEligibility = await sql`SELECT COUNT(*) as count FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA' AND eligibility_cutoffs IS NOT NULL AND eligibility_cutoffs != ''`;
  const withDeadlines = await sql`SELECT COUNT(*) as count FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA' AND closing_date IS NOT NULL AND closing_date != ''`;
  
  console.log(`\nTotal in database: ${result[0].total}`);
  console.log(`Programs with funding amounts: ${withFunding[0].count}`);
  console.log(`Programs with application links: ${withLinks[0].count}`);
  console.log(`Programs with eligibility criteria: ${withEligibility[0].count}`);
  console.log(`Programs with deadlines: ${withDeadlines[0].count}`);
}

restoreCanadaPrograms().catch(console.error);
