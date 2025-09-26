import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, DollarSign, Clock, ArrowRight } from "lucide-react";

interface EligibilityData {
  operation: string;
  scale: string;
  location: string;
  practice: string;
  landControl: string;
  complianceId: string;
}

interface EligibilityResult {
  eligible: "yes" | "likely" | "unclear";
  program: string;
  costShare: string;
  cap: string;
  ruleType: string;
  nextDate: string;
  checklist: string[];
}

interface EligibilityScreenProps {
  onNext: (data: EligibilityData, result: EligibilityResult) => void;
}

export default function EligibilityScreen({ onNext }: EligibilityScreenProps) {
  const [formData, setFormData] = useState<EligibilityData>({
    operation: "",
    scale: "",
    location: "",
    practice: "",
    landControl: "",
    complianceId: ""
  });

  const [result, setResult] = useState<EligibilityResult | null>(null);

  const operations = [
    { value: "cow-calf", label: "Cow-calf" },
    { value: "dairy", label: "Dairy" },
    { value: "sheep", label: "Sheep" },
    { value: "goats", label: "Goats" },
    { value: "horses", label: "Horses" },
    { value: "specialty-crops", label: "Specialty crops" }
  ];

  const scales = [
    { value: "1-50", label: "1-50 head / acres" },
    { value: "51-200", label: "51-200 head / acres" },
    { value: "201-500", label: "201-500 head / acres" },
    { value: "500+", label: "500+ head / acres" }
  ];

  const practices = [
    { value: "cross-fencing", label: "Cross-fencing" },
    { value: "watering-systems", label: "Watering systems" },
    { value: "pasture-renovation", label: "Pasture renovation" },
    { value: "ipm-exclusion", label: "IPM/wildlife exclusion" },
    { value: "traceability", label: "Traceability" }
  ];

  const updateField = (field: keyof EligibilityData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    
    // Auto-calculate result when enough data is provided
    if (newData.operation && newData.scale && newData.location && newData.practice) {
      const mockResult: EligibilityResult = {
        eligible: "likely",
        program: "Environmental Quality Incentives Program (EQIP)",
        costShare: "50-75%",
        cap: "$15,000-$40,000",
        ruleType: "Ranking cutoff",
        nextDate: "November 15, 2024",
        checklist: ["Land control proof", "Compliance ID verification", "Dated quote/practice sketch"]
      };
      setResult(mockResult);
    }
  };

  const isComplete = formData.operation && formData.scale && formData.location && formData.practice && formData.landControl && formData.complianceId;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold" data-testid="text-title">60-Second Eligibility Check</h1>
        <p className="text-muted-foreground">Answer a few questions to see if you likely qualify</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Your Operation</CardTitle>
            <CardDescription>Tell us about your farming operation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Operation Type</Label>
              <Select value={formData.operation} onValueChange={(value) => updateField('operation', value)}>
                <SelectTrigger data-testid="select-operation">
                  <SelectValue placeholder="Select operation type" />
                </SelectTrigger>
                <SelectContent>
                  {operations.map((op) => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Scale</Label>
              <Select value={formData.scale} onValueChange={(value) => updateField('scale', value)}>
                <SelectTrigger data-testid="select-scale">
                  <SelectValue placeholder="Select scale" />
                </SelectTrigger>
                <SelectContent>
                  {scales.map((scale) => (
                    <SelectItem key={scale.value} value={scale.value}>{scale.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Location</Label>
              <Select value={formData.location} onValueChange={(value) => updateField('location', value)}>
                <SelectTrigger data-testid="select-location">
                  <SelectValue placeholder="Select your location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-iowa">United States - Iowa</SelectItem>
                  <SelectItem value="us-texas">United States - Texas</SelectItem>
                  <SelectItem value="us-california">United States - California</SelectItem>
                  <SelectItem value="canada-alberta">Canada - Alberta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Intended Practice</Label>
              <Select value={formData.practice} onValueChange={(value) => updateField('practice', value)}>
                <SelectTrigger data-testid="select-practice">
                  <SelectValue placeholder="Select practice" />
                </SelectTrigger>
                <SelectContent>
                  {practices.map((practice) => (
                    <SelectItem key={practice.value} value={practice.value}>{practice.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Land Control</Label>
              <RadioGroup value={formData.landControl} onValueChange={(value) => updateField('landControl', value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="own" id="own" data-testid="radio-land-own" />
                  <Label htmlFor="own">Own</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lease" id="lease" data-testid="radio-land-lease" />
                  <Label htmlFor="lease">Lease</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm font-medium">Registry/Compliance ID</Label>
              <RadioGroup value={formData.complianceId} onValueChange={(value) => updateField('complianceId', value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="comp-yes" data-testid="radio-compliance-yes" />
                  <Label htmlFor="comp-yes">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="comp-no" data-testid="radio-compliance-no" />
                  <Label htmlFor="comp-no">No</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="not-sure" id="comp-unsure" data-testid="radio-compliance-unsure" />
                  <Label htmlFor="comp-unsure">Not sure</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <CardTitle>Likely Eligible</CardTitle>
              </div>
              <CardDescription>Based on your answers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">PROGRAM</h4>
                <p className="text-sm" data-testid="text-program">{result.program}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    COST SHARE
                  </h4>
                  <p className="text-lg font-semibold text-green-600" data-testid="text-cost-share">{result.costShare}</p>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">CAP RANGE</h4>
                  <p className="text-lg font-semibold" data-testid="text-cap">{result.cap}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  NEXT DEADLINE
                </h4>
                <p className="text-sm font-medium" data-testid="text-deadline">{result.nextDate}</p>
                <p className="text-xs text-muted-foreground">{result.ruleType}</p>
              </div>

              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">MY 3 ITEMS</h4>
                <ul className="space-y-1">
                  {result.checklist.map((item, index) => (
                    <li key={index} className="text-sm flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <Button 
                  className="w-full" 
                  disabled={!isComplete}
                  onClick={() => {
                    console.log('Generate practice plan clicked');
                    onNext(formData, result);
                  }}
                  data-testid="button-practice-plan"
                >
                  Generate my practice plan & quote list
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  disabled={!isComplete}
                  onClick={() => {
                    console.log('Create submission pack clicked');
                    onNext(formData, result);
                  }}
                  data-testid="button-submission-pack"
                >
                  Create my submission pack
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}