import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

// Import all components
import Navigation from "@/components/Navigation";
import WelcomeScreen from "@/components/WelcomeScreen";
import EligibilityScreen from "@/components/EligibilityScreen";
import PracticeCard from "@/components/PracticeCard";
import SubmissionPack from "@/components/SubmissionPack";
import DeadlineCalendar from "@/components/DeadlineCalendar";
import AIAssistant from "@/components/AIAssistant";
import SubsidyBrowser from "@/components/SubsidyBrowser";

function AppContent() {
  const [currentPage, setCurrentPage] = useState("home");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  // Fetch live programs using enhanced endpoints
  const { data: allPrograms = [], isLoading: programsLoading, error: programsError } = useQuery<SubsidyProgram[]>({
    queryKey: ['/api/programs/enhanced'],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
  
  const { data: upcomingDeadlines = [], isLoading: deadlinesLoading, error: deadlinesError } = useQuery<SubsidyProgram[]>({
    queryKey: ['/api/programs/deadlines-soon?days=90'],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
  
  // Fetch program statistics for analytics
  const { data: programStats } = useQuery<ProgramStats>({
    queryKey: ['/api/programs/stats'],
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
  
  // Fetch high priority programs
  const { data: highPriorityPrograms = [] } = useQuery<SubsidyProgram[]>({
    queryKey: ['/api/programs/high-priority'],
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Transform enhanced programs into practice cards format
  const practicePrograms = allPrograms.map((program: SubsidyProgram) => ({
    title: program.title,
    category: program.category,
    costShare: program.fundingAmount || "Varies by program",
    capRange: program.fundingAmount || "Contact local office",
    payoffPeriod: program.deadline ? `Deadline: ${new Date(program.deadline).toLocaleDateString()}` : "Ongoing",
    benefits: [
      "Government cost-share funding available",
      program.isHighPriority ? "High priority program" : "Support for agricultural practices",
      `Source: ${program.sourceAgency || program.dataSource}`,
      program.region ? `Available in: ${program.region}` : "Multiple locations available"
    ],
    verificationNotes: [
      "Application through local office",
      "Eligibility requirements verification",
      program.opportunityNumber ? `Opportunity #: ${program.opportunityNumber}` : "Program-specific documentation"
    ],
    url: program.url,
    publishedDate: program.publishedDate
  }));
  
  // Transform enhanced deadlines data
  const transformedDeadlines = upcomingDeadlines.map((program: SubsidyProgram) => {
    const deadline = program.deadline ? new Date(program.deadline) : null;
    const now = new Date();
    const daysUntil = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    
    return {
      id: program.id,
      program: program.title,
      type: program.isHighPriority ? 'ranking' as const : 'signup' as const,
      date: deadline ? deadline.toLocaleDateString() : 'Contact local office',
      daysUntil: daysUntil || 0,
      location: program.region || program.location || program.country || 'Multiple locations',
      status: (daysUntil && daysUntil > 0) ? 
        (daysUntil <= 14 ? 'closing-soon' as const : 'open' as const) : 
        'unknown' as const
    };
  });

  const handleEligibilityComplete = (data: any, result: any) => {
    setUserData({ ...data, result });
    setCurrentPage("submission");
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case "home":
        return <WelcomeScreen onModeSelect={setCurrentPage} />;
      
      case "eligibility":
        return <EligibilityScreen onNext={handleEligibilityComplete} />;
      
      case "practices":
        return (
          <SubsidyBrowser 
            programs={allPrograms}
            stats={programStats}
            isLoading={programsLoading}
          />
        );
      
      case "submission":
        if (!userData) {
          return (
            <div className="max-w-2xl mx-auto p-6 text-center">
              <h2 className="text-xl font-semibold mb-4">No Data Available</h2>
              <p className="text-muted-foreground mb-4">
                Please complete the eligibility screening or select a practice first.
              </p>
              <button 
                onClick={() => setCurrentPage("eligibility")}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md"
              >
                Start Eligibility Check
              </button>
            </div>
          );
        }
        
        const submissionData = {
          farmerName: "John Smith",
          contact: "john@example.com", 
          location: userData.location || "Iowa County, IA",
          operation: userData.operation || "Cow-calf",
          practice: userData.selectedPractice?.title || userData.practice || "Rotational grazing water points",
          program: userData.result?.program || "Environmental Quality Incentives Program (EQIP)",
          ruleType: userData.result?.ruleType || "Ranking cutoff",
          nextDate: userData.result?.nextDate || "November 15, 2024",
          eligibilityDetails: userData.result ? {
            costShare: userData.result.costShare,
            cap: userData.result.cap,
            eligible: userData.result.eligible
          } : {
            costShare: "50-75%",
            cap: "$15,000-$40,000", 
            eligible: "Likely eligible"
          },
          checklist: userData.result?.checklist || [
            "Land control proof",
            "Registry/compliance ID verification",
            "Dated quote/practice sketch"
          ],
          practiceDetails: {
            diagram: "Practice layout diagram",
            partsList: userData.selectedPractice?.verificationNotes || [
              "Posts (steel or wood)",
              "Energizer unit", 
              "Insulators",
              "Polywire or tape",
              "Water trough",
              "Valves and fittings"
            ]
          }
        };
        
        return (
          <SubmissionPack 
            data={submissionData}
            onExport={(method) => console.log('Export method:', method)} 
          />
        );
      
      case "deadlines":
        return (
          <DeadlineCalendar 
            deadlines={transformedDeadlines}
            onSetReminder={(id) => console.log('Reminder set for:', id)} 
          />
        );
      
      case "help":
        return (
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold">Help & Glossary</h1>
              <p className="text-muted-foreground">Plain-language explanations of subsidy terms and processes</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Key Terms</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium">Cost Share</h4>
                    <p className="text-sm text-muted-foreground">The percentage of practice costs the program will reimburse you. For example, 75% cost-share means you pay 25%.</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Cap</h4>
                    <p className="text-sm text-muted-foreground">The maximum dollar amount a program will pay for a practice, regardless of cost-share percentage.</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Ranking Date</h4>
                    <p className="text-sm text-muted-foreground">Deadline for competitive programs where applications are scored and ranked for funding.</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Until Allocated</h4>
                    <p className="text-sm text-muted-foreground">First-come, first-served funding that continues until program funds are exhausted.</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Common Questions</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium">How do I prove land control?</h4>
                    <p className="text-sm text-muted-foreground">Provide a deed if you own the land, or a lease agreement showing you have control for the contract duration.</p>
                  </div>
                  <div>
                    <h4 className="font-medium">What is a registry/compliance ID?</h4>
                    <p className="text-sm text-muted-foreground">A unique identifier showing you're enrolled in agricultural compliance programs. Contact your local office if you're unsure.</p>
                  </div>
                  <div>
                    <h4 className="font-medium">How long does review take?</h4>
                    <p className="text-sm text-muted-foreground">Typically 30-90 days after the application deadline, depending on program complexity and local office workload.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/20 border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-3">Important Reminders</h3>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>• This tool shows "likely eligible" based on general program rules - final approval comes from your local office</li>
                <li>• Always verify program deadlines and requirements with your local NRCS or extension office</li>
                <li>• Submit applications early - many programs are competitive or have limited funding</li>
                <li>• Keep all receipts and documentation for practice implementation and verification</li>
              </ul>
            </div>
          </div>
        );
      
      default:
        return <WelcomeScreen onModeSelect={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation 
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        hasUnsavedProgress={!!userData}
      />
      
      <main className="pb-20">
        {renderCurrentPage()}
      </main>
      
      <AIAssistant 
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(!assistantOpen)}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
