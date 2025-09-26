import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Bot, User, HelpCircle, X } from "lucide-react";

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  intent?: "eligibility" | "practice" | "submission";
}

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIAssistant({ isOpen, onClose }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "assistant",
      content: "Hi! I'm here to help you navigate subsidy programs. I can assist with eligibility questions, practice planning, and submission preparation. What would you like to know?",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");

  const quickQuestions = [
    { text: "What documents do I need?", intent: "submission" as const },
    { text: "How do I prove land control?", intent: "eligibility" as const },
    { text: "What's a cost-share percentage?", intent: "practice" as const },
    { text: "When are the next deadlines?", intent: "submission" as const }
  ];

  const handleSendMessage = (content: string, intent?: "eligibility" | "practice" | "submission") => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content,
      timestamp: new Date(),
      intent
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      const responses = {
        "What documents do I need?": "For most conservation programs, you'll need: (1) Proof of land control (deed or lease agreement), (2) Registry/compliance ID if applicable, and (3) A dated quote for your planned practice. Some programs may require additional documentation like maps or photos.",
        "How do I prove land control?": "If you own the land, provide a copy of your deed. If you lease, you'll need a lease agreement that shows you have control for the duration of the conservation practice contract (typically 3-10 years depending on the practice).",
        "What's a cost-share percentage?": "Cost-share is the percentage of your practice costs that the program will reimburse. For example, 75% cost-share means you pay 25% and the program covers 75%. Most conservation programs offer 50-75% cost-share with maximum payment caps.",
        "When are the next deadlines?": "Deadlines vary by program and location. EQIP typically has ranking deadlines in November and February. Check the Deadlines section for specific dates in your area, as many programs operate on 'first-come, first-served' until funds run out."
      };

      const responseContent = responses[content as keyof typeof responses] || 
        "I understand you're asking about subsidy programs. Could you be more specific? I can help with eligibility requirements, practice planning, or submission preparation. Try asking about specific documents, deadlines, or practices you're interested in.";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: responseContent,
        timestamp: new Date(),
        intent
      };

      setMessages(prev => [...prev, assistantMessage]);
    }, 1000);
  };

  const handleQuickQuestion = (question: string, intent: "eligibility" | "practice" | "submission") => {
    handleSendMessage(question, intent);
  };

  if (!isOpen) {
    return (
      <Button
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg"
        onClick={onClose}
        data-testid="button-open-assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[500px] shadow-xl z-50 flex flex-col">
      <CardHeader className="flex flex-row items-center space-y-0 pb-3">
        <div className="flex items-center gap-2 flex-1">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Subsidy Assistant</CardTitle>
          <Badge variant="secondary" className="text-xs">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
            Online
          </Badge>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onClose}
          data-testid="button-close-assistant"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-3 p-4 pt-0">
        {/* Messages */}
        <ScrollArea className="flex-1 h-[300px]">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.type === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    message.type === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid={`message-${message.type}-${message.id}`}
                >
                  {message.content}
                </div>

                {message.type === "user" && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Quick Questions */}
        {messages.length === 1 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Quick questions:</p>
            <div className="flex flex-wrap gap-1">
              {quickQuestions.map((q, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleQuickQuestion(q.text, q.intent)}
                  data-testid={`button-quick-${index}`}
                >
                  {q.text}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Ask about eligibility, practices, or deadlines..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(inputValue);
              }
            }}
            className="text-sm"
            data-testid="input-message"
          />
          <Button
            size="icon"
            disabled={!inputValue.trim()}
            onClick={() => handleSendMessage(inputValue)}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          💡 I provide guidance on publicly available program information. Always verify details with your local office.
        </div>
      </CardContent>
    </Card>
  );
}