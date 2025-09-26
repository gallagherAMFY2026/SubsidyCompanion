import DeadlineCalendar from '../DeadlineCalendar';

export default function DeadlineCalendarExample() {
  //todo: remove mock functionality
  const mockDeadlines = [
    {
      id: "eqip-1",
      program: "Environmental Quality Incentives Program (EQIP)",
      type: "ranking" as const,
      date: "November 15, 2024",
      daysUntil: 8,
      location: "Iowa County, IA",
      status: "open" as const
    },
    {
      id: "csp-1", 
      program: "Conservation Stewardship Program (CSP)",
      type: "signup" as const,
      date: "December 1, 2024",
      daysUntil: 24,
      location: "Statewide",
      status: "open" as const
    },
    {
      id: "rcpp-1",
      program: "Regional Conservation Partnership Program",
      type: "allocated" as const,
      date: "October 30, 2024",
      daysUntil: -3,
      location: "Regional",
      status: "open" as const
    },
    {
      id: "crp-1",
      program: "Conservation Reserve Program (CRP)",
      type: "signup" as const,
      date: "February 28, 2025",
      daysUntil: 113,
      location: "County-wide",
      status: "open" as const
    }
  ];

  return (
    <DeadlineCalendar 
      deadlines={mockDeadlines}
      onSetReminder={(id) => console.log('Reminder set for:', id)} 
    />
  );
}