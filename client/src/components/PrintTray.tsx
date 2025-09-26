import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Printer, Mail, Smartphone, Download, Send, Check } from "lucide-react";

interface PrintTrayProps {
  documentTitle: string;
  onExport: (method: string, contact?: string) => void;
}

export default function PrintTray({ documentTitle, onExport }: PrintTrayProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const handleExport = (method: string) => {
    let contact = "";
    if (method === "email" && email) contact = email;
    if (method === "sms" && phone) contact = phone;
    
    console.log(`Exporting ${documentTitle} via ${method}`, contact);
    onExport(method, contact);
    
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const exportOptions = [
    {
      id: "print",
      label: "Print Now",
      description: "Send directly to your printer",
      icon: Printer,
      primary: true,
      requiresContact: false
    },
    {
      id: "download",
      label: "Download PDF",
      description: "Save to your device",
      icon: Download,
      primary: false,
      requiresContact: false
    },
    {
      id: "email",
      label: "Email to Me",
      description: "Send to your email address",
      icon: Mail,
      primary: false,
      requiresContact: true
    },
    {
      id: "sms",
      label: "SMS Link",
      description: "Text download link to phone",
      icon: Smartphone,
      primary: false,
      requiresContact: true
    }
  ];

  if (showSuccess) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Check className="h-12 w-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2" data-testid="text-success">Export Successful!</h3>
          <p className="text-sm text-muted-foreground text-center">
            Your {documentTitle.toLowerCase()} has been prepared and sent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg" data-testid="text-export-title">Export Options</CardTitle>
        <p className="text-sm text-muted-foreground">Get your {documentTitle.toLowerCase()}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Export Options */}
        <div className="space-y-2">
          {exportOptions.filter(opt => !opt.requiresContact).map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.id}
                variant={option.primary ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => handleExport(option.id)}
                data-testid={`button-export-${option.id}`}
              >
                <Icon className="h-4 w-4 mr-3" />
                <div className="text-left">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </Button>
            );
          })}
        </div>

        <Separator />

        {/* Email Option */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
              />
              <Button
                variant="outline"
                size="icon"
                disabled={!email || !/\S+@\S+\.\S+/.test(email)}
                onClick={() => handleExport("email")}
                data-testid="button-send-email"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
              />
              <Button
                variant="outline"
                size="icon"
                disabled={!phone || phone.length < 10}
                onClick={() => handleExport("sms")}
                data-testid="button-send-sms"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-2">
          💡 We recommend printing a copy for your local office visit and keeping a digital backup.
        </div>
      </CardContent>
    </Card>
  );
}