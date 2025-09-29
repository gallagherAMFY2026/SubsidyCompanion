import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    { value: "cross-fencing", label: "Cross-fencing / Rotational grazing" },
    { value: "watering-systems", label: "Watering systems" },
    { value: "pasture-renovation", label: "Pasture renovation" },
    { value: "soil-health", label: "Soil health / Cover crops" },
    { value: "conservation-tillage", label: "Conservation tillage" },
    { value: "nutrient-management", label: "Nutrient management" },
    { value: "irrigation-efficiency", label: "Irrigation efficiency" },
    { value: "riparian-buffers", label: "Riparian buffers / Wetlands" },
    { value: "biodiversity", label: "Biodiversity / Habitat" },
    { value: "emissions-reduction", label: "Emissions reduction" },
    { value: "agroforestry", label: "Agroforestry / Silvopasture" },
    { value: "ipm-exclusion", label: "IPM / Wildlife exclusion" },
    { value: "drought-resilience", label: "Drought resilience" },
    { value: "traceability", label: "Traceability / Certification" }
  ];

  // Centralized territory-to-program mapping
  const getProgramByLocation = (location: string) => {
    if (location.startsWith('canada')) {
      return {
        program: "Canadian Agricultural Partnership (CAP) - AgriInvest",
        ruleType: "Ranking cutoff",
        nextDate: "Rolling applications - Contact provincial office"
      };
    } else if (location.startsWith('australia')) {
      return {
        program: "National Landcare Program",
        ruleType: "Ranking cutoff",
        nextDate: "March 31, 2025"
      };
    } else if (location.startsWith('newzealand')) {
      return {
        program: "Sustainable Food and Fibre Futures (SFF Futures)",
        ruleType: "Ranking cutoff",
        nextDate: "Quarterly rounds - Next: December 2024"
      };
    } else if (location.startsWith('brazil')) {
      return {
        program: "PRONAF - Programa Nacional de Fortalecimento da Agricultura Familiar",
        ruleType: "First-come, first-served",
        nextDate: "Contact local MAPA office"
      };
    } else if (location.startsWith('chile')) {
      return {
        program: "FIA - Fundación para la Innovación Agraria",
        ruleType: "Ranking cutoff",
        nextDate: "Variable by program - Check FIA website"
      };
    }
    // Default to US EQIP
    return {
      program: "Environmental Quality Incentives Program (EQIP)",
      ruleType: "Ranking cutoff",
      nextDate: "November 15, 2024"
    };
  };

  const updateField = (field: keyof EligibilityData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    
    // Auto-calculate result when enough data is provided
    if (newData.operation && newData.scale && newData.location && newData.practice) {
      const programData = getProgramByLocation(newData.location);
      
      const mockResult: EligibilityResult = {
        eligible: "likely",
        program: programData.program,
        costShare: "50-75%",
        cap: "$15,000-$40,000",
        ruleType: programData.ruleType,
        nextDate: programData.nextDate,
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
                  <SelectGroup>
                    <SelectLabel>Canada</SelectLabel>
                    <SelectItem value="canada-national">Canada - National Programs</SelectItem>
                    <SelectItem value="canada-alberta">Canada - Alberta</SelectItem>
                    <SelectItem value="canada-bc">Canada - British Columbia</SelectItem>
                    <SelectItem value="canada-saskatchewan">Canada - Saskatchewan</SelectItem>
                    <SelectItem value="canada-manitoba">Canada - Manitoba</SelectItem>
                    <SelectItem value="canada-ontario">Canada - Ontario</SelectItem>
                    <SelectItem value="canada-quebec">Canada - Quebec</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>United States</SelectLabel>
                    <SelectItem value="us-national">United States - National Programs</SelectItem>
                    <SelectItem value="us-iowa">United States - Iowa</SelectItem>
                    <SelectItem value="us-illinois">United States - Illinois</SelectItem>
                    <SelectItem value="us-nebraska">United States - Nebraska</SelectItem>
                    <SelectItem value="us-minnesota">United States - Minnesota</SelectItem>
                    <SelectItem value="us-kansas">United States - Kansas</SelectItem>
                    <SelectItem value="us-wisconsin">United States - Wisconsin</SelectItem>
                    <SelectItem value="us-indiana">United States - Indiana</SelectItem>
                    <SelectItem value="us-ohio">United States - Ohio</SelectItem>
                    <SelectItem value="us-missouri">United States - Missouri</SelectItem>
                    <SelectItem value="us-south-dakota">United States - South Dakota</SelectItem>
                    <SelectItem value="us-north-dakota">United States - North Dakota</SelectItem>
                    <SelectItem value="us-california">United States - California</SelectItem>
                    <SelectItem value="us-texas">United States - Texas</SelectItem>
                    <SelectItem value="us-florida">United States - Florida</SelectItem>
                    <SelectItem value="us-georgia">United States - Georgia</SelectItem>
                    <SelectItem value="us-north-carolina">United States - North Carolina</SelectItem>
                    <SelectItem value="us-arkansas">United States - Arkansas</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Australia</SelectLabel>
                    <SelectItem value="australia-national">Australia - National Programs</SelectItem>
                    <SelectItem value="australia-nsw">Australia - New South Wales</SelectItem>
                    <SelectItem value="australia-victoria">Australia - Victoria</SelectItem>
                    <SelectItem value="australia-queensland">Australia - Queensland</SelectItem>
                    <SelectItem value="australia-sa">Australia - South Australia</SelectItem>
                    <SelectItem value="australia-wa">Australia - Western Australia</SelectItem>
                    <SelectItem value="australia-tas">Australia - Tasmania</SelectItem>
                    <SelectItem value="australia-nt">Australia - Northern Territory</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>New Zealand</SelectLabel>
                    <SelectItem value="newzealand-national">New Zealand - National Programs</SelectItem>
                    <SelectItem value="newzealand-auckland">New Zealand - Auckland</SelectItem>
                    <SelectItem value="newzealand-waikato">New Zealand - Waikato</SelectItem>
                    <SelectItem value="newzealand-canterbury">New Zealand - Canterbury</SelectItem>
                    <SelectItem value="newzealand-otago">New Zealand - Otago</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Brazil</SelectLabel>
                    <SelectItem value="brazil-national">Brazil - National Programs</SelectItem>
                    <SelectItem value="brazil-south">Brazil - South Region (RS, SC, PR)</SelectItem>
                    <SelectItem value="brazil-southeast">Brazil - Southeast (SP, MG, RJ, ES)</SelectItem>
                    <SelectItem value="brazil-central">Brazil - Central-West (GO, MT, MS, DF)</SelectItem>
                    <SelectItem value="brazil-northeast">Brazil - Northeast Region</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Chile</SelectLabel>
                    <SelectItem value="chile-national">Chile - National Programs</SelectItem>
                    <SelectItem value="chile-north">Chile - North Zone</SelectItem>
                    <SelectItem value="chile-central">Chile - Central Zone</SelectItem>
                    <SelectItem value="chile-south">Chile - South Zone</SelectItem>
                    <SelectItem value="chile-austral">Chile - Austral Zone</SelectItem>
                  </SelectGroup>
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

            <Button 
              className="w-full mt-6" 
              disabled={!(formData.operation && formData.scale && formData.location && formData.practice)}
              onClick={() => {
                // Auto-calculate result when button is clicked
                if (formData.operation && formData.scale && formData.location && formData.practice) {
                  const programData = getProgramByLocation(formData.location);
                  
                  const mockResult: EligibilityResult = {
                    eligible: "likely",
                    program: programData.program,
                    costShare: "50-75%",
                    cap: "$15,000-$40,000",
                    ruleType: programData.ruleType,
                    nextDate: programData.nextDate,
                    checklist: ["Land control proof", "Compliance ID verification", "Dated quote/practice sketch"]
                  };
                  setResult(mockResult);
                }
              }}
              data-testid="button-check-eligibility"
            >
              Check Eligibility
            </Button>
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