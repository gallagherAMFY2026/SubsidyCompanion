import SubmissionPack from '../SubmissionPack';

export default function SubmissionPackExample() {
  const mockData = {
    farmerName: "John Smith",
    contact: "john@example.com",
    location: "Iowa County, IA",
    operation: "Cow-calf",
    practice: "Rotational grazing water points",
    program: "Environmental Quality Incentives Program (EQIP)",
    ruleType: "Ranking cutoff",
    nextDate: "November 15, 2024",
    eligibilityDetails: {
      costShare: "50-75%",
      cap: "$15,000-$40,000",
      eligible: "Likely eligible"
    },
    checklist: [
      "Land control proof",
      "Registry/compliance ID verification", 
      "Dated quote/practice sketch",
      "Before photos of current setup"
    ],
    practiceDetails: {
      diagram: "Rotational grazing layout",
      partsList: [
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
      data={mockData}
      onExport={(method) => console.log('Export method:', method)} 
    />
  );
}