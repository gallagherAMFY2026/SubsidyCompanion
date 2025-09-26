import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Mail, Smartphone, Printer, Check } from "lucide-react";

interface SubmissionPackData {
  farmerName?: string;
  contact?: string;
  location: string;
  operation: string;
  practice: string;
  program: string;
  ruleType: string;
  nextDate: string;
  eligibilityDetails: {
    costShare: string;
    cap: string;
    eligible: string;
  };
  checklist: string[];
  practiceDetails?: {
    diagram: string;
    partsList: string[];
  };
}

interface SubmissionPackProps {
  data: SubmissionPackData;
  onExport: (method: string) => void;
}

export default function SubmissionPack({ data, onExport }: SubmissionPackProps) {
  const exportOptions = [
    { id: "print", label: "Print", icon: Printer },
    { id: "email", label: "Email to myself", icon: Mail },
    { id: "sms", label: "SMS link to myself", icon: Smartphone },
    { id: "download", label: "Download PDF", icon: Download }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold" data-testid="text-title">Your Submission Pack</h1>
        <p className="text-muted-foreground">Complete pack ready for your local office</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pack Preview */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <CardTitle>Submission Pack Preview</CardTitle>
              </div>
              <CardDescription>This is what your submission pack will contain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cover Page */}
              <div className="border-2 border-dashed border-border p-4 rounded-lg bg-muted/20">
                <h3 className="font-semibold mb-3" data-testid="text-cover-title">Cover Page</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Farmer:</span> {data.farmerName || "Not provided"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contact:</span> {data.contact || "Not provided"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span> {data.location}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operation:</span> {data.operation}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Practice:</span> {data.practice}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Program:</span> {data.program}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Eligibility Summary */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Eligibility Summary
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Status</span>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {data.eligibilityDetails.eligible}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Cost Share</span>
                    <span className="font-medium text-green-600">{data.eligibilityDetails.costShare}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Cap Range</span>
                    <span className="font-medium">{data.eligibilityDetails.cap}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Practice Plan */}
              <div>
                <h3 className="font-semibold mb-3">Practice Plan</h3>
                <div className="border border-border rounded-lg p-4 bg-muted/20">
                  <p className="text-sm text-muted-foreground mb-2">Diagram Template (for hand-drawing)</p>
                  <div className="h-24 border-2 border-dashed border-border rounded flex items-center justify-center text-muted-foreground text-sm">
                    Practice sketch area - draw your planned layout here
                  </div>
                  {data.practiceDetails?.partsList && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-2">Parts List for Quote:</p>
                      <ul className="text-sm space-y-1">
                        {data.practiceDetails.partsList.map((part, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <span className="w-1 h-1 bg-foreground rounded-full"></span>
                            {part}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Document Checklist */}
              <div>
                <h3 className="font-semibold mb-3">Document Checklist</h3>
                <div className="space-y-2">
                  {data.checklist.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 border border-border rounded flex items-center justify-center text-xs">
                        □
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Submission Instructions */}
              <div>
                <h3 className="font-semibold mb-3">Where to Submit</h3>
                <div className="bg-muted/20 border border-border rounded-lg p-4 text-sm space-y-2">
                  <p><strong>Next Steps:</strong></p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Contact your local NRCS office to schedule an intake appointment</li>
                    <li>Bring this complete pack with all required documents</li>
                    <li>Submit before the {data.nextDate} deadline</li>
                    <li>Ask about the typical review timeline</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Export Options */}
        <div>
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Export Your Pack</CardTitle>
              <CardDescription>Choose how to get your submission pack</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {exportOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      console.log(`Export via ${option.label} clicked`);
                      onExport(option.id);
                    }}
                    data-testid={`button-export-${option.id}`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {option.label}
                  </Button>
                );
              })}
              
              <div className="pt-4 text-xs text-muted-foreground">
                <p>💡 Tip: Print a copy to take to your local office, and save a digital copy for your records.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}