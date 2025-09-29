import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, MapPin, Search, ExternalLink, AlertCircle } from "lucide-react";

interface SubsidyProgram {
  id: string;
  title: string;
  summary: string;
  category: string;
  publishedDate: Date;
  url: string;
  fundingAmount?: string | null;
  deadline?: Date | null;
  location?: string | null;
  dataSource: string;
  sourceAgency?: string | null;
  country: string;
  region?: string | null;
  opportunityNumber?: string | null;
  isHighPriority?: boolean | null;
}

interface ProgramStats {
  total: number;
  active: number;
  expired: number;
  highPriority: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  upcomingDeadlines: number;
}

interface SubsidyBrowserProps {
  programs: SubsidyProgram[];
  stats: ProgramStats | undefined;
  isLoading: boolean;
}

export default function SubsidyBrowser({ programs, stats, isLoading }: SubsidyBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("deadline");

  // Get unique countries from programs
  const countries = Array.from(new Set(programs.map(p => p.country))).sort();

  // Filter and sort programs
  let filteredPrograms = programs.filter(program => {
    const matchesSearch = program.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         program.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         program.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCountry = countryFilter === "all" || program.country === countryFilter;
    return matchesSearch && matchesCountry;
  });

  // Sort programs
  filteredPrograms = [...filteredPrograms].sort((a, b) => {
    if (sortBy === "deadline") {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    } else if (sortBy === "priority") {
      if (a.isHighPriority && !b.isHighPriority) return -1;
      if (!a.isHighPriority && b.isHighPriority) return 1;
      return 0;
    } else if (sortBy === "newest") {
      return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
    }
    return 0;
  });

  const getDaysUntilDeadline = (deadline: Date | null) => {
    if (!deadline) return null;
    const now = new Date();
    const days = Math.ceil((new Date(deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header with Stats */}
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold" data-testid="text-title">Browse Subsidies</h1>
          <p className="text-muted-foreground">Explore agricultural funding programs across 6 territories</p>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-primary" data-testid="stat-total">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Programs</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-green-600" data-testid="stat-active">{stats.active}</div>
                  <div className="text-sm text-muted-foreground">Active Now</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-orange-600" data-testid="stat-priority">{stats.highPriority}</div>
                  <div className="text-sm text-muted-foreground">High Priority</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-blue-600" data-testid="stat-deadlines">{stats.upcomingDeadlines}</div>
                  <div className="text-sm text-muted-foreground">Closing Soon</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search programs by name, category, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-country">
                <SelectValue placeholder="All countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Deadline (Urgent First)</SelectItem>
                <SelectItem value="priority">Priority Level</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredPrograms.length} of {programs.length} programs
      </div>

      {/* Program Grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading programs...</p>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No programs found matching your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrograms.map((program) => {
            const daysUntil = getDaysUntilDeadline(program.deadline || null);
            const isUrgent = daysUntil !== null && daysUntil > 0 && daysUntil <= 30;
            const isClosingSoon = daysUntil !== null && daysUntil > 0 && daysUntil <= 14;
            
            return (
              <Card key={program.id} className="hover-elevate flex flex-col" data-testid={`card-program-${program.id}`}>
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">{program.title}</CardTitle>
                    {program.isHighPriority && (
                      <Badge variant="default" className="shrink-0">Priority</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="h-3 w-3 mr-1" />
                      {program.country}
                    </Badge>
                    {program.category && (
                      <Badge variant="secondary" className="text-xs">{program.category}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <CardDescription className="line-clamp-3">
                      {program.summary || "Program details available through application"}
                    </CardDescription>
                    
                    <div className="space-y-2 text-sm">
                      {program.fundingAmount && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-green-600">{program.fundingAmount}</span>
                        </div>
                      )}
                      {program.deadline && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className={isClosingSoon ? "text-red-600 font-medium" : isUrgent ? "text-orange-600 font-medium" : ""}>
                            {new Date(program.deadline).toLocaleDateString()}
                            {daysUntil !== null && daysUntil > 0 && ` (${daysUntil}d)`}
                          </span>
                        </div>
                      )}
                      {program.region && (
                        <div className="text-xs text-muted-foreground">
                          Available in: {program.region}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full mt-auto" 
                    asChild
                    data-testid={`button-view-${program.id}`}
                  >
                    <a href={program.url} target="_blank" rel="noopener noreferrer">
                      View Details
                      <ExternalLink className="h-4 w-4 ml-2" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
