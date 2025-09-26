import WelcomeScreen from '../WelcomeScreen';

export default function WelcomeScreenExample() {
  return (
    <WelcomeScreen 
      onModeSelect={(mode) => console.log('Mode selected:', mode)} 
    />
  );
}