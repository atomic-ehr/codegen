/**
 * CLI Spinner and Progress Utilities
 *
 * Visual progress indicators for long-running operations
 */

import { performance } from "node:perf_hooks";
import ora, { type Ora } from "ora";
import pc from "picocolors";

/**
 * Task progress tracker
 */
export class ProgressTracker {
	private tasks: Map<
		string,
		{
			startTime: number;
			status: "pending" | "running" | "completed" | "failed";
		}
	> = new Map();
	private currentSpinner: Ora | null = null;

	/**
	 * Start a new task
	 */
	startTask(taskId: string, message: string): void {
		this.tasks.set(taskId, {
			startTime: performance.now(),
			status: "running",
		});

		if (this.currentSpinner) {
			this.currentSpinner.stop();
		}

		this.currentSpinner = ora({
			text: message,
			spinner: "dots",
		}).start();
	}

	/**
	 * Update task progress
	 */
	updateTask(taskId: string, message: string): void {
		const task = this.tasks.get(taskId);
		if (!task || task.status !== "running") return;

		if (this.currentSpinner) {
			this.currentSpinner.text = message;
		}
	}

	/**
	 * Complete a task successfully
	 */
	completeTask(taskId: string, message?: string): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		const duration = Math.round(performance.now() - task.startTime);
		task.status = "completed";

		if (this.currentSpinner) {
			const finalMessage = message || this.currentSpinner.text;
			this.currentSpinner.succeed(
				`${finalMessage} ${pc.gray(`(${duration}ms)`)}`,
			);
			this.currentSpinner = null;
		}
	}

	/**
	 * Fail a task
	 */
	failTask(taskId: string, error?: string): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		task.status = "failed";

		if (this.currentSpinner) {
			const errorMessage = error ? `: ${error}` : "";
			this.currentSpinner.fail(this.currentSpinner.text + errorMessage);
			this.currentSpinner = null;
		}
	}

	/**
	 * Stop all spinners
	 */
	stop(): void {
		if (this.currentSpinner) {
			this.currentSpinner.stop();
			this.currentSpinner = null;
		}
	}

	/**
	 * Get task statistics
	 */
	getStats(): {
		total: number;
		completed: number;
		failed: number;
		running: number;
		pending: number;
	} {
		let completed = 0;
		let failed = 0;
		let running = 0;
		let pending = 0;

		for (const task of this.tasks.values()) {
			switch (task.status) {
				case "completed":
					completed++;
					break;
				case "failed":
					failed++;
					break;
				case "running":
					running++;
					break;
				case "pending":
					pending++;
					break;
			}
		}

		return {
			total: this.tasks.size,
			completed,
			failed,
			running,
			pending,
		};
	}
}

/**
 * Simple spinner for single operations
 */
export class SimpleSpinner {
	private spinner: Ora;

	constructor(message: string) {
		this.spinner = ora({
			text: message,
			spinner: "dots",
		});
	}

	start(message?: string): SimpleSpinner {
		if (message) {
			this.spinner.text = message;
		}
		this.spinner.start();
		return this;
	}

	update(message: string): SimpleSpinner {
		this.spinner.text = message;
		return this;
	}

	succeed(message?: string): void {
		this.spinner.succeed(message);
	}

	fail(message?: string): void {
		this.spinner.fail(message);
	}

	warn(message?: string): void {
		this.spinner.warn(message);
	}

	info(message?: string): void {
		this.spinner.info(message);
	}

	stop(): void {
		this.spinner.stop();
	}
}

/**
 * Progress bar for batch operations
 */
export class ProgressBar {
	private current = 0;
	private barLength = 30;
	private startTime = performance.now();

	constructor(
		private total: number,
		private message: string,
	) {}

	/**
	 * Update progress
	 */
	update(current: number, additionalInfo?: string): void {
		this.current = Math.min(current, this.total);
		this.render(additionalInfo);
	}

	/**
	 * Increment progress by 1
	 */
	increment(additionalInfo?: string): void {
		this.update(this.current + 1, additionalInfo);
	}

	/**
	 * Complete the progress bar
	 */
	complete(message?: string): void {
		this.current = this.total;
		this.render();

		const duration = Math.round(performance.now() - this.startTime);
		console.log(
			pc.green(`✅ ${message || this.message} ${pc.gray(`(${duration}ms)`)}`),
		);
	}

	/**
	 * Render the progress bar
	 */
	private render(additionalInfo?: string): void {
		const percentage = Math.round((this.current / this.total) * 100);
		const filled = Math.round((this.current / this.total) * this.barLength);
		const empty = this.barLength - filled;

		const bar = pc.green("█".repeat(filled)) + pc.gray("░".repeat(empty));
		const progress = `${this.current}/${this.total}`;
		const info = additionalInfo ? pc.gray(` ${additionalInfo}`) : "";

		// Clear line and write progress
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		process.stdout.write(
			`${this.message} ${bar} ${pc.cyan(progress)} ${pc.yellow(`${percentage}%`)}${info}`,
		);

		// Add newline when complete
		if (this.current === this.total) {
			process.stdout.write("\n");
		}
	}
}

/**
 * Create a simple spinner
 */
export function createSpinner(message: string): SimpleSpinner {
	return new SimpleSpinner(message);
}

/**
 * Create a progress tracker for multiple tasks
 */
export function createProgressTracker(): ProgressTracker {
	return new ProgressTracker();
}

/**
 * Create a progress bar
 */
export function createProgressBar(total: number, message: string): ProgressBar {
	return new ProgressBar(total, message);
}

/**
 * Show a spinner for a promise
 */
export async function withSpinner<T>(
	promise: Promise<T>,
	options: {
		start: string;
		success?: string | ((result: T) => string);
		fail?: string | ((error: any) => string);
	},
): Promise<T> {
	const spinner = ora({
		text: options.start,
		spinner: "dots",
	}).start();

	try {
		const result = await promise;
		const successMessage =
			typeof options.success === "function"
				? options.success(result)
				: options.success || options.start;
		spinner.succeed(successMessage);
		return result;
	} catch (error) {
		const failMessage =
			typeof options.fail === "function"
				? options.fail(error)
				: options.fail || `Failed: ${options.start}`;
		spinner.fail(failMessage);
		throw error;
	}
}

/**
 * Multi-step task execution with progress
 */
export async function executeSteps<T>(
	steps: Array<{
		name: string;
		task: () => Promise<T>;
	}>,
): Promise<T[]> {
	const results: T[] = [];
	const progressBar = new ProgressBar(steps.length, "Executing tasks");

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		progressBar.update(i, step?.name);

		try {
			const result = await step?.task();
			if (result) {
				results.push(result);
			}
		} catch (error) {
			progressBar.complete(`Failed at step: ${step?.name}`);
			throw error;
		}
	}

	progressBar.complete("All tasks completed");
	return results;
}
