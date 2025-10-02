import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

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

interface ProgramStats {
  country: string;
  count: string;
}

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

  const { data: allPrograms = [], isLoading: programsLoading } = useQuery<SubsidyProgramCurated[]>({
    queryKey: ['/api/programs'],
    staleTime: 10 * 60 * 1000,
  });
  
  const { data: programStats = [] } = useQuery<ProgramStats[]>({
    queryKey: ['/api/programs/stats'],
    staleTime: 30 * 60 * 1000,
  });

  const statsMap = programStats.reduce((acc, stat) => {
    acc[stat.country] = parseInt(stat.count);
    return acc;
  }, {} as Record<string, number>);

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
          <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
              <button
                onClick={() => setCurrentPage("home")}
                className="text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-2"
                data-testid="button-back-home"
              >
                ← Back to Home
              </button>
              <h1 className="text-3xl font-bold mb-2">Conservation Practices</h1>
              <p className="text-gray-600">
                Explore agricultural practices eligible for subsidies
              </p>
            </div>
            
            {programsLoading ? (
              <div className="flex justify-center py-12">
                <div className="text-gray-500">Loading programs...</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {allPrograms.slice(0, 12).map((program, idx) => (
                  <PracticeCard
                    key={program.id}
                    title={program.programName}
                    category={program.country}
                    costShare={program.fundingAmount || "Varies by program"}
                    capRange={program.paymentCap || "Contact local office"}
                    payoffPeriod={program.closingDate || program.applicationDeadline || "Ongoing"}
                    benefits={[
                      "Government funding available",
                      program.keyObjectives || program.focus || "Agricultural support program",
                      program.administered || "Multiple funding sources",
                    ].filter(Boolean)}
                    verificationNotes={[
                      "Application through program office",
                      program.eligibilityCutoffs || "Eligibility requirements apply",
                      program.additionalInfo || "Program-specific documentation"
                    ].filter(Boolean)}
                    onBuildPlan={() => {
                      if (program.hyperlink) {
                        window.open(program.hyperlink, '_blank');
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      
      case "submission":
        return <SubmissionPack 
          data={userData || {}}
          onExport={() => {}}
        />;
      
      case "deadlines":
        return (
          <div className="p-6 max-w-6xl mx-auto">
            <button
              onClick={() => setCurrentPage("home")}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-2"
              data-testid="button-back-home"
            >
              ← Back to Home
            </button>
            <DeadlineCalendar 
              deadlines={allPrograms
                .filter(p => p.closingDate || p.applicationDeadline)
                .map((program) => ({
                  id: program.id,
                  program: program.programName,
                  type: 'signup' as const,
                  date: program.closingDate || program.applicationDeadline || 'TBD',
                  daysUntil: 0,
                  location: program.country,
                  status: 'open' as const
                }))
              }
              onSetReminder={() => {}}
            />
          </div>
        );

      case "browse":
        return (
          <SubsidyBrowser 
            programs={allPrograms}
            isLoading={programsLoading}
            stats={statsMap}
          />
        );
      
      case "help":
        return (
          <div className="p-6 max-w-4xl mx-auto">
            <button
              onClick={() => setCurrentPage("home")}
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-2"
              data-testid="button-back-home"
            >
              ← Back to Home
            </button>
            <h1 className="text-3xl font-bold mb-6">Help & Resources</h1>
            <div className="space-y-6 text-gray-700">
              <section>
                <h2 className="text-xl font-semibold mb-3">Getting Started</h2>
                <p className="mb-2">Subsidy Companion helps you find and apply for agricultural subsidies across 6 territories:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Canada (CA) - {statsMap['CA'] || 0} programs</li>
                  <li>United States (US) - {statsMap['US'] || 0} programs</li>
                  <li>Australia (AU) - {statsMap['AU'] || 0} programs</li>
                  <li>New Zealand (NZ) - {statsMap['NZ'] || 0} programs</li>
                  <li>Brazil (BR) - {statsMap['BR'] || 0} programs</li>
                  <li>Chile (CL) - {statsMap['CL'] || 0} programs</li>
                </ul>
              </section>
              
              <section>
                <h2 className="text-xl font-semibold mb-3">How to Use</h2>
                <ol className="list-decimal pl-6 space-y-2">
                  <li><strong>Browse Subsidies:</strong> Explore all {allPrograms.length} curated programs by country</li>
                  <li><strong>Check Eligibility:</strong> Answer questions to find programs that match your farm</li>
                  <li><strong>Review Details:</strong> Read program descriptions, funding amounts, and deadlines</li>
                  <li><strong>Apply:</strong> Follow the program links to official application portals</li>
                </ol>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">Need Help?</h2>
                <p>Contact the program administrators directly through the links provided in each program listing.</p>
              </section>
            </div>
          </div>
        );
      
      default:
        return <WelcomeScreen onModeSelect={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-yellow-50">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      
      {renderCurrentPage()}
      
      <button
        onClick={() => setAssistantOpen(true)}
        className="fixed bottom-6 right-6 bg-green-600 text-white rounded-full p-4 shadow-lg hover:bg-green-700 transition-colors z-50"
        aria-label="Open AI Assistant"
        data-testid="button-assistant"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </button>

      <AIAssistant
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
