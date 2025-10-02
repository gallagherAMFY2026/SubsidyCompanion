import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, MapPin, Search, ExternalLink, AlertCircle } from "lucide-react";

interface SubsidyProgramCurated {
  id: string;
  country: string;
  programName: string;
  description: string | null;
  hyperlink: string | null;
  fundingAmount: string | null;
  paymentCap: string | null;
  keyObjectives: string | null;
  focus: string | null;
  administered: string | null;
  acreageProductionLimit: string | null;
  eligibilityCutoffs: string | null;
  cutoffsCaps: string | null;
  closingDate: string | null;
  applicationDeadline: string | null;
  budgetExhaustion: string | null;
  additionalInfo: string | null;
  notesStructure: string | null;
  details: string | null;
  definitionsHowItWorks: string | null;
  sourceSheet: string;
}

interface SubsidyBrowserProps {
  programs: SubsidyProgramCurated[];
  stats: Record<string, number>;
  isLoading: boolean;
}

export default function SubsidyBrowser({ programs, stats, isLoading }: SubsidyBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("country");

  const countries = Array.from(new Set(programs.map(p => p.country))).sort();

  let filteredPrograms = programs.filter(program => {
    const matchesSearch = 
      program.programName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.keyObjectives?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.focus?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCountry = countryFilter === "all" || program.country === countryFilter;
    return matchesSearch && matchesCountry;
  });

  filteredPrograms = [...filteredPrograms].sort((a, b) => {
    if (sortBy === "country") {
      return a.country.localeCompare(b.country) || a.programName.localeCompare(b.programName);
    } else if (sortBy === "name") {
      return a.programName.localeCompare(b.programName);
    } else if (sortBy === "deadline") {
      const aDeadline = a.closingDate || a.applicationDeadline;
      const bDeadline = b.closingDate || b.applicationDeadline;
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
                      {program.budgetExhaustion && (
                        <Badge variant="destructive">Budget Limited</Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl mb-2" data-testid={`text-program-name-${program.id}`}>
                      {program.programName}
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
                  {program.fundingAmount && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Funding Amount</div>
                        <div className="text-muted-foreground">{program.fundingAmount}</div>
                      </div>
                    </div>
                  )}
                  
                  {program.paymentCap && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Payment Cap</div>
                        <div className="text-muted-foreground">{program.paymentCap}</div>
                      </div>
                    </div>
                  )}

                  {(program.closingDate || program.applicationDeadline) && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Deadline</div>
                        <div className="text-muted-foreground">
                          {program.closingDate || program.applicationDeadline}
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
                {(program.keyObjectives || program.focus) && (
                  <div className="pt-3 border-t">
                    <div className="font-medium text-sm mb-1">
                      {program.keyObjectives ? 'Key Objectives' : 'Focus'}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {program.keyObjectives || program.focus}
                    </p>
                  </div>
                )}

                {/* Eligibility Info */}
                {(program.eligibilityCutoffs || program.cutoffsCaps || program.acreageProductionLimit) && (
                  <div className="pt-3 border-t">
                    <div className="font-medium text-sm mb-1">Eligibility</div>
                    <p className="text-sm text-muted-foreground">
                      {program.eligibilityCutoffs || program.cutoffsCaps || program.acreageProductionLimit}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
