import PracticeCard from '../PracticeCard';

export default function PracticeCardExample() {
  return (
    <div className="max-w-md">
      <PracticeCard
        title="Rotational Grazing Water Points"
        category="Rotational grazing & water"
        costShare="50-75%"
        capRange="$8,000-$25,000"
        payoffPeriod="1-2 seasons"
        benefits={[
          "Reduce feed costs through better pasture utilization",
          "Improve water quality and soil health",
          "Increase stocking capacity by 20-30%"
        ]}
        verificationNotes={[
          "Before photos of existing water setup",
          "After photos showing installed system",
          "Receipts for all materials and labor"
        ]}
        onBuildPlan={() => console.log('Building plan for rotational grazing')}
      />
    </div>
  );
}