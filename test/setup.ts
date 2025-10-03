import { beforeAll, afterAll } from "bun:test";

beforeAll(() => {
  global.console = {
    ...console,
    log: () => {},
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  };

  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
});

afterAll(() => {});