import fs from 'fs';
import path from 'path';
import {
  FEATURE_FEEDBACK_ENABLED,
  getTripMoreActions,
  type TripMoreAction,
} from './features';

describe('Feature Flags & Conditional Feedback Presentation', () => {
  describe('FEATURE_FEEDBACK_ENABLED default state', () => {
    it('defaults to false for safe friends-only beta release', () => {
      // Unless explicitly enabled via EXPO_PUBLIC_FEATURE_FEEDBACK_ENABLED='true'
      expect(FEATURE_FEEDBACK_ENABLED).toBe(false);
    });
  });

  describe('Trip More menu actions (getTripMoreActions)', () => {
    it('omits feedback action when disabled (default)', () => {
      const actions = getTripMoreActions(false);

      expect(actions).toHaveLength(9);
      expect(actions.some((a) => a.path === 'feedback')).toBe(false);

      const paths = actions.map((a) => a.path);
      expect(paths).toEqual([
        'edit',
        'itinerary-pdf',
        'day-map',
        'export-trip',
        'plan-with-ai',
        'import-activities',
        'export-activities',
        'use-template',
        'save-template',
      ]);
    });

    it('includes feedback action when enabled', () => {
      const actions = getTripMoreActions(true);

      expect(actions).toHaveLength(10);
      const feedbackAction = actions.find((a) => a.path === 'feedback');
      expect(feedbackAction).toBeDefined();
      expect(feedbackAction).toEqual<TripMoreAction>({
        title: 'Feedback',
        subtitle: 'Notes and suggestions for the app',
        icon: 'addNote',
        path: 'feedback',
      });
    });

    it('ensures no empty menu or broken titles regardless of flag state', () => {
      for (const enabled of [false, true]) {
        const actions = getTripMoreActions(enabled);
        expect(actions.length).toBeGreaterThan(0);
        for (const action of actions) {
          expect(action.title.trim().length).toBeGreaterThan(0);
          expect(action.subtitle.trim().length).toBeGreaterThan(0);
          expect(action.icon).toBeTruthy();
          expect(action.path).toBeTruthy();
        }
      }
    });
  });

  describe('Source guarding verification', () => {
    it('ensures app/index.tsx guards empty-state and Your Data feedback entry points', () => {
      const indexPath = path.resolve(__dirname, '../../app/index.tsx');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('import { FEATURE_FEEDBACK_ENABLED } from');
      expect(content).toMatch(/\{FEATURE_FEEDBACK_ENABLED\s*\?\s*\(?\s*<Button[^>]*label="Feedback"/);
      expect(content).toMatch(/\{FEATURE_FEEDBACK_ENABLED\s*\?\s*\(?\s*<ListRow[^>]*title="Feedback"/);
    });

    it('ensures app/trip/[tripId]/(tabs)/index.tsx uses getTripMoreActions', () => {
      const overviewPath = path.resolve(__dirname, '../../app/trip/[tripId]/(tabs)/index.tsx');
      const content = fs.readFileSync(overviewPath, 'utf-8');

      expect(content).toContain('import { getTripMoreActions }');
      expect(content).toContain('getTripMoreActions()');
      expect(content).not.toMatch(/path:\s*'feedback'/);
    });

    it('ensures app/feedback.tsx guards the route and redirects to Home when disabled', () => {
      const feedbackPath = path.resolve(__dirname, '../../app/feedback.tsx');
      const content = fs.readFileSync(feedbackPath, 'utf-8');

      expect(content).toContain('import { FEATURE_FEEDBACK_ENABLED }');
      expect(content).toContain("import { Redirect");
      expect(content).toMatch(/if\s*\(!FEATURE_FEEDBACK_ENABLED\)\s*\{\s*return\s*<Redirect\s+href="\/"\s*\/>;/);
    });
  });
});
