import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

async function importData() {
  const sql = neon(process.env.DATABASE_URL!);
  const allData = JSON.parse(fs.readFileSync('all_spreadsheet_data.json', 'utf-8'));
  
  const territories = ['US', 'CA', 'NZ', 'AU', 'CL', 'BR', 'LATAM'];
  let totalImported = 0;
  
  for (const territory of territories) {
    const data = allData[territory];
    if (!data || !Array.isArray(data)) continue;
    
    console.log(`\n📍 Processing ${territory}: ${data.length} programs`);
    
    for (const row of data) {
      try {
        // Map all possible column names to unified schema
        const programName = row['Subsidy Program'] || row['Program'] || '';
        
        // Skip empty rows
        if (!programName || programName.trim() === '') continue;
        
        await sql`
          INSERT INTO subsidy_programs_curated_10_01_25 (
            country, source_sheet, program_name, description, hyperlink,
            funding_amount, payment_cap, key_objectives, focus, administered,
            acreage_production_limit, eligibility_cutoffs, cutoffs_caps,
            closing_date, application_deadline, budget_exhaustion_marker,
            additional_information, notes_structure, details, definitions_how_it_works
          ) VALUES (
            ${territory},
            ${territory},
            ${programName},
            ${row['Description'] || ''},
            ${row['Hyperlink'] || row['Link'] || ''},
            ${row['Funding Amount'] || ''},
            ${row['Payment Caps'] || row['Payment/Funding Cap'] || ''},
            ${row['Key Objectives'] || ''},
            ${row['Focus'] || ''},
            ${row['Administered'] || ''},
            ${row['Acreage/Production Limit'] || ''},
            ${row['Eligibility Cut-Offs'] || row['Eligibility Cut‑Offs'] || ''},
            ${row['Cut Offs / Caps'] || ''},
            ${row['Closing Date/Deadline'] || ''},
            ${row['Application/Enrollment Deadline'] || row['Application/Deadline'] || ''},
            ${row['Budget Exhaustion Marker'] || ''},
            ${row['Additional Information'] || ''},
            ${row['Notes/Structure'] || ''},
            ${row['Details'] || ''},
            ${row['Definitions/How It Works'] || ''}
          )
        `;
        totalImported++;
        
      } catch (error: any) {
        console.error(`Error importing row in ${territory}:`, error.message);
      }
    }
    
    console.log(`✅ ${territory}: Imported`);
  }
  
  console.log(`\n✅ TOTAL IMPORTED: ${totalImported} programs`);
}

importData().catch(console.error);
