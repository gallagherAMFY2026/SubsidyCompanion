import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, Bell } from "lucide-react";

interface Deadline {
  id: string;
  program: string;
  type: "ranking" | "signup" | "allocated";
  date: string;
  daysUntil: number;
  location: string;
  status: "open" | "closing-soon" | "unknown";
}

interface DeadlineCalendarProps {
  deadlines: Deadline[];
  onSetReminder: (deadlineId: string) => void;
}

export default function DeadlineCalendar({ deadlines, onSetReminder }: DeadlineCalendarProps) {
  const getStatusColor = (status: string, daysUntil: number) => {
    if (daysUntil <= 7) return "destructive";
    if (daysUntil <= 14) return "default";
    return "secondary";
  };

  const getStatusText = (status: string, daysUntil: number) => {
    if (daysUntil <= 0) return "Closed";
    if (daysUntil <= 7) return "Closing soon";
    if (daysUntil <= 14) return "Due soon";
    return "Open";
  };

  const sortedDeadlines = deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold flex items-center justify-center gap-2" data-testid="text-title">
          <Calendar className="h-6 w-6" />
          Program Deadlines
        </h1>
        <p className="text-muted-foreground">
          Next 90 days of ranking and application deadlines in your area
        </p>
      </div>

      <div className="grid gap-4">
        {sortedDeadlines.map((deadline) => (
          <Card key={deadline.id} className={`${deadline.daysUntil <= 7 ? 'ring-2 ring-red-200' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold" data-testid={`text-program-${deadline.id}`}>
                      {deadline.program}
                    </h3>
                    <Badge variant={getStatusColor(deadline.status, deadline.daysUntil)}>
                      {getStatusText(deadline.status, deadline.daysUntil)}
                    </Badge>
                    {deadline.daysUntil <= 7 && deadline.daysUntil > 0 && (
                      <Badge variant="destructive" className="animate-pulse">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Urgent
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-medium" data-testid={`text-date-${deadline.id}`}>{deadline.date}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <p className="font-medium capitalize">{deadline.type.replace('-', ' ')}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Location:</span>
                      <p className="font-medium">{deadline.location}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {deadline.daysUntil <= 0 
                        ? "Deadline passed" 
                        : deadline.daysUntil === 1 
                        ? "1 day remaining"
                        : `${deadline.daysUntil} days remaining`
                      }
                    </span>
                  </div>
                </div>

                <div className="ml-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={deadline.daysUntil <= 0}
                    onClick={() => {
                      console.log(`Set reminder for ${deadline.program}`);
                      onSetReminder(deadline.id);
                    }}
                    data-testid={`button-reminder-${deadline.id}`}
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Set Reminder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base">Important Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>• Many programs operate on a "first-come, first-served" basis until funds are allocated</p>
          <p>• Contact your local office early to improve your chances of approval</p>
          <p>• Some dates may change - always verify with your local office before submitting</p>
          <p>• Programs marked as "unknown" require contacting your local office for the next deadline</p>
        </CardContent>
      </Card>
    </div>
  );
}