import { useState } from 'react';
import AIAssistant from '../AIAssistant';

export default function AIAssistantExample() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="relative h-96">
      <AIAssistant 
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
      />
    </div>
  );
}