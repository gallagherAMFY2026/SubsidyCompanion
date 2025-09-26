import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, FileText, Calendar, HelpCircle, Menu, X } from "lucide-react";

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  hasUnsavedProgress?: boolean;
}

export default function Navigation({ currentPage, onNavigate, hasUnsavedProgress = false }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "eligibility", label: "Eligibility", icon: CheckCircle },
    { id: "practices", label: "Practices", icon: FileText },
    { id: "submission", label: "Submission Pack", icon: FileText },
    { id: "deadlines", label: "Deadlines", icon: Calendar },
    { id: "help", label: "Help", icon: HelpCircle }
  ];

  const handleNavigate = (page: string) => {
    console.log(`Navigating to ${page}`);
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div 
              className="text-xl font-semibold text-primary cursor-pointer"
              onClick={() => handleNavigate("home")}
              data-testid="text-logo"
            >
              Subsidy Companion
            </div>
            {hasUnsavedProgress && (
              <Badge variant="secondary" className="text-xs">
                Progress saved
              </Badge>
            )}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleNavigate(item.id)}
                  className={isActive ? "bg-primary/10 text-primary" : ""}
                  data-testid={`button-nav-${item.id}`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              );
            })}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-2">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full justify-start ${isActive ? "bg-primary/10 text-primary" : ""}`}
                    data-testid={`button-mobile-nav-${item.id}`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}