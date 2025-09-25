/**
 * CLI Utilities - Re-exports from main utils with spinner support
 */

import { createSpinner } from "./spinner";

// Re-export all logger functions from the main utils
export {
  type CodegenLogger,
  complete,
  configure,
  createLogger,
  debug,
  dim,
  error,
  header,
  info,
  type LogOptions,
  list,
  plain,
  progress,
  section,
  step,
  success,
  table,
  warn,
} from "../../utils/codegen-logger";

// Export CLI-specific utilities
export { createSpinner };

/**
 * Run a task with a spinner
 */
export async function withSpinner<T>(
  promise: Promise<T>,
  message: string,
  successMessage?: string,
): Promise<T> {
  const spinner = createSpinner(message).start();
  try {
    const result = await promise;
    spinner.succeed(successMessage || message);
    return result;
  } catch (error) {
    spinner.fail(`Failed: ${message}`);
    throw error;
  }
}
