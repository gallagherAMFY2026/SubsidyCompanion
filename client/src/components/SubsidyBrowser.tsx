import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, MapPin, Search, ExternalLink, AlertCircle, FileText, ChevronDown, ChevronUp, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SubsidyProgramCurated {
  id: string;
  country: string;
  program_name: string;
  description: string | null;
  hyperlink: string | null;
  funding_amount: string | null;
  payment_cap: string | null;
  key_objectives: string | null;
  focus: string | null;
  administered: string | null;
  acreage_production_limit: string | null;
  eligibility_cutoffs: string | null;
  cutoffs_caps: string | null;
  closing_date: string | null;
  application_deadline: string | null;
  budget_exhaustion_marker: string | null;
  additional_information: string | null;
  notes_structure: string | null;
  details: string | null;
  definitions_how_it_works: string | null;
  source_sheet: string;
}

interface SubsidyBrowserProps {
  programs: SubsidyProgramCurated[];
  stats: Record<string, number>;
  isLoading: boolean;
}

interface ProgramDoc {
  doc_id: string;
  program_id: string;
  doc_type: string;
  display_name: string;
  file_slug: string | null;
  source_url: string | null;
  language: string;
  effective_date: string | null;
  sha256: string | null;
  notes: string | null;
  created_at: string;
}

function ProgramDocuments({ programId }: { programId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: documents = [], isLoading } = useQuery<ProgramDoc[]>({
    queryKey: ['/api/programs', programId, 'documents'],
    enabled: isOpen,
  });

  // Always show the toggle button, even when no documents

  const docTypeLabels: Record<string, string> = {
    guideline: "Program Guide",
    application_form: "Application Form",
    faq: "FAQ",
    checklist: "Checklist",
    terms: "Terms & Conditions",
    webpage: "Web Page",
    quick_guide: "Quick Guide",
    reference: "Reference",
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          data-testid={`button-toggle-docs-${programId}`}
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Program Documents {documents.length > 0 && `(${documents.length})`}
          </span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-2">Loading documents...</div>
        ) : documents.length > 0 ? (
          <div className="space-y-2 pt-2">
            {documents.map((doc) => (
              <div
                key={doc.doc_id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                data-testid={`doc-item-${doc.doc_id}`}
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{doc.display_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {docTypeLabels[doc.doc_type] || doc.doc_type}
                    {doc.language && doc.language !== 'en' && ` · ${doc.language.toUpperCase()}`}
                  </div>
                </div>
                {doc.file_slug && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    data-testid={`button-download-${doc.doc_id}`}
                  >
                    <a href={`/pdfs/${doc.file_slug}`} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {!doc.file_slug && doc.source_url && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    data-testid={`button-view-${doc.doc_id}`}
                  >
                    <a href={doc.source_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-2">No documents available</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function SubsidyBrowser({ programs, stats, isLoading }: SubsidyBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("country");

  const countries = Array.from(new Set(programs.map(p => p.country))).sort();

  let filteredPrograms = programs.filter(program => {
    if (!program.program_name) return false;
    
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === "" || 
      program.program_name?.toLowerCase().includes(searchLower) ||
      program.description?.toLowerCase().includes(searchLower) ||
      program.key_objectives?.toLowerCase().includes(searchLower) ||
      program.focus?.toLowerCase().includes(searchLower);
    const matchesCountry = countryFilter === "all" || program.country === countryFilter;
    return matchesSearch && matchesCountry;
  });

  filteredPrograms = [...filteredPrograms].sort((a, b) => {
    if (sortBy === "country") {
      return a.country.localeCompare(b.country) || a.program_name.localeCompare(b.program_name);
    } else if (sortBy === "name") {
      return a.program_name.localeCompare(b.program_name);
    } else if (sortBy === "deadline") {
      const aDeadline = a.closing_date || a.application_deadline;
      const bDeadline = b.closing_date || b.application_deadline;
      if (!aDeadline && !bDeadline) return 0;
      if (!aDeadline) return 1;
      if (!bDeadline) return -1;
      return aDeadline.localeCompare(bDeadline);
    }
    return 0;
  });

  const totalPrograms = programs.length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold" data-testid="text-title">Browse Subsidies</h1>
          <p className="text-muted-foreground">Explore {totalPrograms} agricultural funding programs across 6 territories</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([country, count]) => (
            <Card key={country}>
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-primary" data-testid={`stat-${country}`}>{count}</div>
                  <div className="text-sm text-muted-foreground">{country}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs by name, description, or objectives..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Country</label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger data-testid="select-country">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>{country} ({stats[country] || 0})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger data-testid="select-sort">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="country">Country</SelectItem>
                  <SelectItem value="name">Program Name</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>Showing {filteredPrograms.length} of {programs.length} programs</span>
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchTerm("")}
            data-testid="button-clear-search"
          >
            Clear search
          </Button>
        )}
      </div>

      {/* Program List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-muted-foreground">Loading programs...</div>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No programs found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredPrograms.map((program) => (
            <Card key={program.id} className="hover-elevate" data-testid={`card-program-${program.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" data-testid={`badge-country-${program.country}`}>{program.country}</Badge>
                      {program.budget_exhaustion_marker && (
                        <Badge variant="destructive">Budget Limited</Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl mb-2" data-testid={`text-program-name-${program.id}`}>
                      {program.program_name}
                    </CardTitle>
                    {program.description && (
                      <CardDescription className="line-clamp-2">
                        {program.description}
                      </CardDescription>
                    )}
                  </div>
                  {program.hyperlink && (
                    <Button asChild variant="outline" size="sm" data-testid={`button-view-program-${program.id}`}>
                      <a href={program.hyperlink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Key Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {program.funding_amount && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Funding Amount</div>
                        <div className="text-muted-foreground">{program.funding_amount}</div>
                      </div>
                    </div>
                  )}
                  
                  {program.payment_cap && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Payment Cap</div>
                        <div className="text-muted-foreground">{program.payment_cap}</div>
                      </div>
                    </div>
                  )}

                  {(program.closing_date || program.application_deadline) && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Deadline</div>
                        <div className="text-muted-foreground">
                          {program.closing_date || program.application_deadline}
                        </div>
                      </div>
                    </div>
                  )}

                  {program.administered && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Administered By</div>
                        <div className="text-muted-foreground">{program.administered}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Objectives or Focus */}
                {(program.key_objectives || program.focus) && (
                  <div className="pt-3 border-t">
                    <div className="font-medium text-sm mb-1">
                      {program.key_objectives ? 'Key Objectives' : 'Focus'}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {program.key_objectives || program.focus}
                    </p>
                  </div>
                )}

                {/* Eligibility Info */}
                {(program.eligibility_cutoffs || program.cutoffs_caps || program.acreage_production_limit) && (
                  <div className="pt-3 border-t">
                    <div className="font-medium text-sm mb-1">Eligibility</div>
                    <p className="text-sm text-muted-foreground">
                      {program.eligibility_cutoffs || program.cutoffs_caps || program.acreage_production_limit}
                    </p>
                  </div>
                )}

                {/* Program Documents */}
                <div className="pt-3 border-t">
                  <ProgramDocuments programId={program.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
