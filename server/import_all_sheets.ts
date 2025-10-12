import * as XLSX from 'xlsx';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function importAllSheets() {
  const workbook = XLSX.readFile('attached_assets/Subsidies and Grants v 2_1760298397771.xlsx');
  
  console.log('Found sheets:', workbook.SheetNames);
  
  let totalImported = 0;
  const sheetStats: Record<string, number> = {};
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n=== Processing sheet: ${sheetName} ===`);
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    console.log(`Found ${jsonData.length} rows in ${sheetName}`);
    
    let imported = 0;
    
    for (const row of jsonData as any[]) {
      // Skip empty rows
      if (!row['Program Name'] && !row['program_name']) continue;
      
      const programData = {
        country: 'CA',
        program_name: row['Program Name'] || row['program_name'] || '',
        description: row['Description'] || row['description'] || null,
        hyperlink: row['Hyperlink'] || row['hyperlink'] || null,
        funding_amount: row['Funding Amount'] || row['funding_amount'] || null,
        payment_cap: row['Payment Cap'] || row['payment_cap'] || null,
        key_objectives: row['Key Objectives'] || row['key_objectives'] || null,
        focus: row['Focus'] || row['focus'] || null,
        administered: row['Administered'] || row['administered'] || null,
        acreage_production_limit: row['Acreage/Production Limit'] || row['acreage_production_limit'] || null,
        eligibility_cutoffs: row['Eligibility Cutoffs'] || row['eligibility_cutoffs'] || null,
        cutoffs_caps: row['Cutoffs/Caps'] || row['cutoffs_caps'] || null,
        closing_date: row['Closing Date'] || row['closing_date'] || null,
        application_deadline: row['Application Deadline'] || row['application_deadline'] || null,
        budget_exhaustion_marker: row['Budget Exhaustion Marker'] || row['budget_exhaustion_marker'] || null,
        additional_information: row['Additional Information'] || row['additional_information'] || null,
        notes_structure: row['Notes/Structure'] || row['notes_structure'] || null,
        details: row['Details'] || row['details'] || null,
        definitions_how_it_works: row['Definitions/How it Works'] || row['definitions_how_it_works'] || null,
        source_sheet: sheetName,
      };
      
      try {
        await sql`
          INSERT INTO subsidy_programs_curated_10_01_25 (
            country, program_name, description, hyperlink,
            funding_amount, payment_cap, key_objectives, focus,
            administered, acreage_production_limit, eligibility_cutoffs,
            cutoffs_caps, closing_date, application_deadline,
            budget_exhaustion_marker, additional_information,
            notes_structure, details, definitions_how_it_works, source_sheet
          ) VALUES (
            ${programData.country}, ${programData.program_name}, ${programData.description}, ${programData.hyperlink},
            ${programData.funding_amount}, ${programData.payment_cap}, ${programData.key_objectives}, ${programData.focus},
            ${programData.administered}, ${programData.acreage_production_limit}, ${programData.eligibility_cutoffs},
            ${programData.cutoffs_caps}, ${programData.closing_date}, ${programData.application_deadline},
            ${programData.budget_exhaustion_marker}, ${programData.additional_information},
            ${programData.notes_structure}, ${programData.details}, ${programData.definitions_how_it_works}, ${programData.source_sheet}
          )
        `;
        imported++;
      } catch (error) {
        console.error(`Error importing row from ${sheetName}:`, error);
      }
    }
    
    sheetStats[sheetName] = imported;
    totalImported += imported;
    console.log(`Imported ${imported} programs from ${sheetName}`);
  }
  
  console.log('\n=== IMPORT SUMMARY ===');
  console.log('Programs imported by sheet:');
  Object.entries(sheetStats).forEach(([sheet, count]) => {
    console.log(`  ${sheet}: ${count}`);
  });
  console.log(`\nTOTAL IMPORTED: ${totalImported}`);
  
  // Verify total count
  const result = await sql`SELECT COUNT(*) as total FROM subsidy_programs_curated_10_01_25 WHERE country = 'CA'`;
  console.log(`\nFinal count in database: ${result[0].total} Canadian programs`);
}

importAllSheets().catch(console.error);
