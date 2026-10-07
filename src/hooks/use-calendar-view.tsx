import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CalendarView } from "@/components/WeekCalendar";

/**
 * Calendar view state that starts on the day view in phones (a week grid is
 * unreadable at that width) while keeping the desktop default untouched.
 * The user can still switch to any view afterwards - the switch to "day"
 * happens once, when a small screen is first detected.
 */
export function useResponsiveCalendarView(desktopDefault: CalendarView = "workweek") {
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarView>(desktopDefault);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !isMobile) return;
    applied.current = true;
    setView("day");
  }, [isMobile]);

  return [view, setView] as const;
}
