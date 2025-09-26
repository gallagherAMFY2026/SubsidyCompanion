import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Clock, Camera, ArrowRight } from "lucide-react";

interface PracticeCardProps {
  title: string;
  category: string;
  costShare: string;
  capRange: string;
  payoffPeriod: string;
  benefits: string[];
  verificationNotes: string[];
  onBuildPlan: () => void;
}

export default function PracticeCard({
  title,
  category,
  costShare,
  capRange,
  payoffPeriod,
  benefits,
  verificationNotes,
  onBuildPlan
}: PracticeCardProps) {
  return (
    <Card className="hover-elevate">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg" data-testid={`text-practice-title-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {title}
            </CardTitle>
            <CardDescription>{category}</CardDescription>
          </div>
          <Badge variant="secondary">{payoffPeriod}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1 text-muted-foreground text-sm">
              <DollarSign className="h-3 w-3" />
              Cost Share
            </div>
            <p className="font-semibold text-green-600" data-testid="text-cost-share">{costShare}</p>
          </div>
          <div>
            <div className="text-muted-foreground text-sm">Cap Range</div>
            <p className="font-semibold" data-testid="text-cap-range">{capRange}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Benefits
          </h4>
          <ul className="text-sm space-y-1">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-green-500 mt-1">•</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <Camera className="h-3 w-3" />
            Verification Photos Needed
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            {verificationNotes.map((note, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-1">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>

        <Button 
          className="w-full" 
          onClick={() => {
            console.log(`Build plan clicked for ${title}`);
            onBuildPlan();
          }}
          data-testid={`button-build-plan-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          Build my plan
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}