import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import { queryView, type QueryState } from './queryView';

describe('TripTravellersScreen React Hooks ordering & lifecycle transitions', () => {
  it('enforces Rules of Hooks: no hooks are declared after any conditional early return', () => {
    const filePath = path.resolve(__dirname, '../../app/trip/[tripId]/travellers.tsx');
    const code = fs.readFileSync(filePath, 'utf-8');

    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    let travellersFnBody: any[] = [];

    // Find export default function TripTravellersScreen
    for (const stmt of ast.program.body) {
      if (
        stmt.type === 'ExportDefaultDeclaration' &&
        stmt.declaration.type === 'FunctionDeclaration' &&
        stmt.declaration.id?.name === 'TripTravellersScreen'
      ) {
        travellersFnBody = stmt.declaration.body.body;
        break;
      }
    }

    expect(travellersFnBody.length).toBeGreaterThan(0);

    let firstEarlyReturnLine = -1;
    const hooksAfterEarlyReturn: { name: string; line: number }[] = [];

    for (const stmt of travellersFnBody) {
      // Check for early return (e.g. if (...) return ...)
      if (stmt.type === 'IfStatement') {
        const hasReturn =
          stmt.consequent.type === 'ReturnStatement' ||
          (stmt.consequent.type === 'BlockStatement' &&
            stmt.consequent.body.some((s: any) => s.type === 'ReturnStatement'));
        if (hasReturn && firstEarlyReturnLine === -1) {
          firstEarlyReturnLine = stmt.loc?.start.line ?? 0;
        }
      } else if (stmt.type === 'ReturnStatement' && firstEarlyReturnLine === -1) {
        firstEarlyReturnLine = stmt.loc?.start.line ?? 0;
      }

      // Check if this statement contains a React hook call (use...)
      if (firstEarlyReturnLine !== -1) {
        // Find any call expression starting with 'use'
        const codeSlice = code.slice(stmt.start, stmt.end);
        const hookMatches = codeSlice.match(/\buse[A-Z][a-zA-Z0-9_]*\b/g);
        if (hookMatches) {
          for (const hook of hookMatches) {
            hooksAfterEarlyReturn.push({
              name: hook,
              line: stmt.loc?.start.line ?? 0,
            });
          }
        }
      }
    }

    expect(firstEarlyReturnLine).toBeGreaterThan(0);
    expect(hooksAfterEarlyReturn).toEqual([]);
  });

  it('verifies loading -> ready transition behavior in queryView for TripTravellersScreen', () => {
    // 1. Initial mounting state: loading
    const initialLoadingState: QueryState<any> = {
      data: undefined,
      error: undefined,
      loading: true,
    };
    expect(queryView(initialLoadingState)).toBe('loading');

    // 2. Data arrives: ready
    const readyState: QueryState<any> = {
      data: { id: 'lapland', name: 'Lapland' },
      error: undefined,
      loading: false,
    };
    expect(queryView(readyState)).toBe('ready');
  });

  it('verifies error/retry transition behavior in queryView for TripTravellersScreen', () => {
    // 1. Failed initial load
    const failedState: QueryState<any> = {
      data: undefined,
      error: new Error('Failed to read database'),
      loading: false,
    };
    expect(queryView(failedState)).toBe('failed');

    // 2. Retry triggered: still failed view until data arrives or error resolves
    const retryingState: QueryState<any> = {
      data: undefined,
      error: new Error('Failed to read database'),
      loading: true,
    };
    expect(queryView(retryingState)).toBe('failed');

    // 3. Retry succeeds: transitions to ready
    const recoveredState: QueryState<any> = {
      data: { id: 'lapland', name: 'Lapland' },
      error: undefined,
      loading: false,
    };
    expect(queryView(recoveredState)).toBe('ready');
  });
});
