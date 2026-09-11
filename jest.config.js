/**
 * Domain tests only — src/domain is pure TypeScript with no native imports,
 * so it runs in plain node. See docs/technical-reference.md §10.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['babel-jest', { configFile: './babel.config.js' }] },
};
