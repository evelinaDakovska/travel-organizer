import type { IconName } from '../ui/components/Icon';

/**
 * Feature flags for the application.
 * Centralized, typed, and defaulting to false for beta safety.
 */
export const FEATURE_FEEDBACK_ENABLED: boolean =
  process.env.EXPO_PUBLIC_FEATURE_FEEDBACK_ENABLED === 'true';

export type TripMoreAction = {
  title: string;
  subtitle: string;
  icon: IconName;
  path:
    | 'edit'
    | 'itinerary-pdf'
    | 'day-map'
    | 'export-calendar'
    | 'export-trip'
    | 'import-activities'
    | 'export-activities'
    | 'plan-with-ai'
    | 'use-template'
    | 'save-template'
    | 'feedback';
};

/**
 * Returns available actions for the Trip Overview "More" menu.
 * When feedback is disabled, the feedback item is omitted without leaving
 * empty gaps or broken dividers.
 */
export function getTripMoreActions(
  feedbackEnabled: boolean = FEATURE_FEEDBACK_ENABLED,
): TripMoreAction[] {
  const actions: TripMoreAction[] = [
    { title: 'Edit trip', subtitle: 'Name, dates, time zone, notes', icon: 'settings', path: 'edit' },
    {
      title: 'Share as PDF',
      subtitle: 'The itinerary, day by day, to send or print',
      icon: 'pdf',
      path: 'itinerary-pdf',
    },
    {
      title: 'Day map',
      subtitle: "Each day's places in order, and the day in Google Maps",
      icon: 'dayMap',
      path: 'day-map',
    },
    {
      title: 'Add to calendar',
      subtitle: 'Chosen plans as a calendar file — a copy, not kept in sync',
      icon: 'addToCalendar',
      path: 'export-calendar',
    },
    {
      title: 'Export trip',
      subtitle: 'This trip as a file, to import on another phone',
      icon: 'share',
      path: 'export-trip',
    },
    {
      title: 'Plan with AI',
      subtitle: 'This trip as text for ChatGPT — you see it all first',
      icon: 'planWithAi',
      path: 'plan-with-ai',
    },
    {
      title: 'Import activities',
      subtitle: 'From a file, such as one written with ChatGPT',
      icon: 'importActivities',
      path: 'import-activities',
    },
    {
      title: 'Export activities',
      subtitle: 'Chosen ideas and plans, as a file to share',
      icon: 'exportActivities',
      path: 'export-activities',
    },
    {
      title: 'Use a template',
      subtitle: 'Add saved tasks, notes and lists',
      icon: 'lists',
      path: 'use-template',
    },
    {
      title: 'Save as template',
      subtitle: 'Keep this preparation for next time',
      icon: 'lists',
      path: 'save-template',
    },
  ];

  if (feedbackEnabled) {
    actions.push({
      title: 'Feedback',
      subtitle: 'Notes and suggestions for the app',
      icon: 'addNote',
      path: 'feedback',
    });
  }

  return actions;
}
