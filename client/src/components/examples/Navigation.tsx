import Navigation from '../Navigation';

export default function NavigationExample() {
  return (
    <div className="min-h-32">
      <Navigation 
        currentPage="eligibility"
        onNavigate={(page) => console.log('Navigate to:', page)}
        hasUnsavedProgress={true}
      />
    </div>
  );
}