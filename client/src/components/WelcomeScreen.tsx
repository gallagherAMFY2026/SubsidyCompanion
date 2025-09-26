import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, FileText, Calendar, HelpCircle } from "lucide-react";

interface WelcomeScreenProps {
  onModeSelect: (mode: string) => void;
}

export default function WelcomeScreen({ onModeSelect }: WelcomeScreenProps) {
  const modes = [
    {
      id: "eligibility",
      title: "Check eligibility",
      description: "Find out if you qualify for subsidy programs in under 60 seconds",
      icon: CheckCircle,
      primary: true
    },
    {
      id: "practices",
      title: "Explore practices",
      description: "Browse conservation practices and their typical funding ranges",
      icon: FileText,
      primary: false
    },
    {
      id: "submission",
      title: "Get my submission pack",
      description: "Generate a complete submission-ready pack for your local office",
      icon: FileText,
      primary: false
    },
    {
      id: "deadlines",
      title: "Learn deadlines",
      description: "View upcoming deadlines and application windows in your area",
      icon: Calendar,
      primary: false
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-semibold text-foreground" data-testid="text-title">
          Subsidy Companion
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-subtitle">
          In under 5 minutes: confirm likely eligibility, see typical funding amounts, 
          and get a personalized submission pack for your local office.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <Card 
              key={mode.id} 
              className={`hover-elevate cursor-pointer transition-all ${mode.primary ? 'ring-2 ring-primary' : ''}`}
              onClick={() => {
                console.log(`${mode.title} selected`);
                onModeSelect(mode.id);
              }}
              data-testid={`card-mode-${mode.id}`}
            >
              <CardHeader className="flex flex-row items-center space-y-0 gap-4">
                <Icon className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{mode.title}</CardTitle>
                  <CardDescription>{mode.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-4">
          No account needed to start • Save your answers optionally
        </p>
        <Button variant="outline" size="sm" data-testid="button-help">
          <HelpCircle className="h-4 w-4 mr-2" />
          Need help getting started?
        </Button>
      </div>
    </div>
  );
}