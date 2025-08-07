/**
 * Global Test Setup
 * 
 * This file is automatically loaded before all tests run.
 * It sets up the testing environment, global mocks, and utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

// Global test configuration
const TEST_CONFIG = {
	// Temporary directories for test isolation
	TEMP_DIR: join(process.cwd(), 'test-temp'),
	FIXTURES_DIR: join(process.cwd(), 'test/fixtures'),
	SNAPSHOTS_DIR: join(process.cwd(), 'test/snapshots'),
	
	// Test timeouts
	DEFAULT_TIMEOUT: 10000,
	INTEGRATION_TIMEOUT: 30000,
	E2E_TIMEOUT: 60000,
	
	// Performance thresholds
	PERFORMANCE_THRESHOLDS: {
		// TypeSchema generation should be under 1000ms for small schemas
		TYPESCHEMA_GENERATION: 1000,
		// Code generation should be under 2000ms for moderate schemas  
		CODE_GENERATION: 2000,
		// File operations should be under 500ms
		FILE_OPERATIONS: 500,
	}
};

// Global test state
let testStartTime: number;
let suiteStartTime: number;

// Make test configuration globally available
declare global {
	var TEST_CONFIG: {
		TEMP_DIR: string;
		FIXTURES_DIR: string;
		SNAPSHOTS_DIR: string;
		DEFAULT_TIMEOUT: number;
		INTEGRATION_TIMEOUT: number;
		E2E_TIMEOUT: number;
		PERFORMANCE_THRESHOLDS: {
			TYPESCHEMA_GENERATION: number;
			CODE_GENERATION: number;
			FILE_OPERATIONS: number;
		};
	};
	var testUtils: typeof import('./utils').testUtils;
	var restoreConsole: () => void;
}

globalThis.TEST_CONFIG = TEST_CONFIG;

// Global setup - runs once before all tests
beforeAll(async () => {
	console.log('🧪 Setting up test environment...');
	suiteStartTime = performance.now();
	
	// Create test directories
	if (!existsSync(TEST_CONFIG.TEMP_DIR)) {
		mkdirSync(TEST_CONFIG.TEMP_DIR, { recursive: true });
	}
	
	if (!existsSync(TEST_CONFIG.FIXTURES_DIR)) {
		mkdirSync(TEST_CONFIG.FIXTURES_DIR, { recursive: true });
	}
	
	if (!existsSync(TEST_CONFIG.SNAPSHOTS_DIR)) {
		mkdirSync(TEST_CONFIG.SNAPSHOTS_DIR, { recursive: true });
	}
	
	// Set NODE_ENV for testing
	process.env.NODE_ENV = 'test';
	
	// Suppress console output during tests unless explicitly needed
	if (!process.env.TEST_VERBOSE) {
		const originalConsoleLog = console.log;
		const originalConsoleWarn = console.warn;
		const originalConsoleError = console.error;
		
		console.log = () => {};
		console.warn = () => {};
		console.error = () => {};
		
		// Restore for test failures
		globalThis.restoreConsole = () => {
			console.log = originalConsoleLog;
			console.warn = originalConsoleWarn;
			console.error = originalConsoleError;
		};
	}
	
	// Load test utilities globally
	try {
		const { testUtils } = await import('./utils');
		globalThis.testUtils = testUtils;
	} catch (error) {
		console.warn('Warning: Could not load test utilities:', error);
	}
	
	console.log('✅ Test environment ready');
});

// Global teardown - runs once after all tests
afterAll(async () => {
	const suiteEndTime = performance.now();
	const totalTime = Math.round(suiteEndTime - suiteStartTime);
	
	console.log(`🎯 All tests completed in ${totalTime}ms`);
	
	// Cleanup test directories
	if (existsSync(TEST_CONFIG.TEMP_DIR)) {
		try {
			rmSync(TEST_CONFIG.TEMP_DIR, { recursive: true, force: true });
		} catch (error) {
			console.warn('Warning: Could not cleanup temp directory:', error);
		}
	}
	
	// Restore console if it was suppressed
	if (typeof globalThis.restoreConsole === 'function') {
		globalThis.restoreConsole();
	}
});

// Per-test setup - runs before each test
beforeEach(() => {
	testStartTime = performance.now();
});

// Per-test teardown - runs after each test
afterEach(() => {
	const testEndTime = performance.now();
	const testTime = testEndTime - testStartTime;
	
	// Log slow tests
	if (testTime > 1000) {
		console.warn(`⚠️  Slow test detected: ${Math.round(testTime)}ms`);
	}
});

// Global error handlers for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});

process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	process.exit(1);
});

// Export test configuration for use in other test files
export { TEST_CONFIG };