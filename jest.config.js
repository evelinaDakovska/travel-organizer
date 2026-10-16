/**
 * Domain tests only — src/domain is pure TypeScript with no native imports,
 * so it runs in plain node. See docs/technical-reference.md §10.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/server'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['babel-jest', { configFile: './babel.config.js' }] },
  moduleNameMapper: {
    '^expo/virtual/env$': '<rootDir>/src/testing/mockEnv.js',
  },
};
