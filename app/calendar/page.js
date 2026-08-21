'use client';

import AppShell from '../../components/AppShell';
import CalendarSettings from '../../components/CalendarSettings';

export default function CalendarPage() {
  return <AppShell title="Calendar" eyebrow="Manage / Calendar" description="Manage national holidays and employee non-working days used by checklist scheduling."><CalendarSettings /></AppShell>;
}
