import { neon } from '@neondatabase/serverless';
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

interface DocRecord {
  program_title: string;
  doc_type: string;
  display_name: string;
  file_name: string;
  language: string;
  source_url?: string;
  notes?: string;
}

// Manual mapping of program titles to IDs (will be populated from DB)
const programTitleToId: Record<string, string> = {};

async function loadProgramMappings() {
  const programs = await sql`
    SELECT id, program_name FROM subsidy_programs_curated_10_01_25
  ` as Array<{ id: string; program_name: string }>;

  programs.forEach((p) => {
    programTitleToId[p.program_name.toLowerCase()] = p.id;
  });

  console.log(`Loaded ${programs.length} program mappings`);
}

function calculateSHA256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

async function ingestDocuments(docs: DocRecord[]) {
  await loadProgramMappings();

  let inserted = 0;
  let skipped = 0;

  for (const doc of docs) {
    // Find program ID by fuzzy matching
    const normalizedTitle = doc.program_title.toLowerCase();
    let programId = programTitleToId[normalizedTitle];

    // Try partial matching if exact match fails
    if (!programId) {
      const partialMatch = Object.keys(programTitleToId).find(key => 
        key.includes(normalizedTitle) || normalizedTitle.includes(key)
      );
      if (partialMatch) {
        programId = programTitleToId[partialMatch];
        console.log(`Fuzzy matched "${doc.program_title}" to "${partialMatch}"`);
      }
    }

    if (!programId) {
      console.log(`⚠️  Skipping "${doc.program_title}" - no matching program found`);
      skipped++;
      continue;
    }

    // Calculate file path and hash
    const filePath = path.join(__dirname, '../static/pdfs/canada/Canada - PDF Support Docs', doc.file_name);
    
    let sha256: string | null = null;
    if (fs.existsSync(filePath)) {
      sha256 = calculateSHA256(filePath);
    } else {
      console.log(`⚠️  File not found: ${doc.file_name}`);
    }

    // Generate file slug (remove "Canada - PDF Support Docs/" prefix)
    const fileSlug = `canada/${doc.file_name}`;

    await sql`
      INSERT INTO program_docs (program_id, doc_type, display_name, file_slug, source_url, language, sha256, notes)
      VALUES (${programId}, ${doc.doc_type}, ${doc.display_name}, ${fileSlug}, ${doc.source_url || null}, ${doc.language}, ${sha256}, ${doc.notes || null})
    `;

    console.log(`✅ Inserted: ${doc.display_name} for ${doc.program_title}`);
    inserted++;
  }

  console.log(`\n📊 Summary: ${inserted} inserted, ${skipped} skipped`);
}

// Sample documents to ingest from manifest
const sampleDocs: DocRecord[] = [
  {
    program_title: "AgriInnovation Program",
    doc_type: "guideline",
    display_name: "Program Guide (EN)",
    file_name: "AgriInnovate_Guide_EN.pdf",
    language: "en",
  },
  {
    program_title: "Agricultural Clean Technology Program",
    doc_type: "application_form",
    display_name: "Application Form",
    file_name: "ACT_Research_Innovation_Application.pdf",
    language: "en",
  },
];

// Run ingestion
if (require.main === module) {
  ingestDocuments(sampleDocs)
    .then(() => {
      console.log('Document ingestion complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error during ingestion:', err);
      process.exit(1);
    });
}

export { ingestDocuments };
