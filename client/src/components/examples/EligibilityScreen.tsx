import EligibilityScreen from '../EligibilityScreen';

export default function EligibilityScreenExample() {
  return (
    <EligibilityScreen 
      onNext={(data, result) => console.log('Eligibility complete:', data, result)} 
    />
  );
}