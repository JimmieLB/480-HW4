/**
 * Core logic for the `ask_user` tool.
 *
 * Kept free of Pi runtime imports so it can be unit-tested with a fake UI.
 */

export const CUSTOM_ANSWER_LABEL = "✎ Other (type your own answer)";

/** Minimal slice of Pi's `ctx.ui` that this tool needs. */
export interface AskUI {
	select(title: string, options: string[], opts?: { signal?: AbortSignal }): Promise<string | undefined>;
	input(title: string, placeholder?: string, opts?: { signal?: AbortSignal }): Promise<string | undefined>;
}

export interface AskUserParams {
	question: string;
	options?: string[];
	allowCustom?: boolean;
	placeholder?: string;
}

export type AskUserStatus = "selected" | "custom" | "cancelled" | "empty";

export interface AskUserDetails {
	question: string;
	options: string[];
	status: AskUserStatus;
	answer?: string;
}

export interface AskUserOutcome {
	text: string;
	details: AskUserDetails;
}

export class AskUserUnavailableError extends Error {
	constructor() {
		super(
			"ask_user is unavailable: there is no interactive UI in this session (print/JSON mode). " +
				"Do not retry. Either state the open question in your reply and stop, or proceed with the most " +
				"reasonable assumption and say which assumption you made.",
		);
		this.name = "AskUserUnavailableError";
	}
}

/** Trim, drop blanks, and remove duplicates while preserving order. */
export function normalizeOptions(options: string[] | undefined): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of options ?? []) {
		const option = raw.trim();
		if (option && !seen.has(option)) {
			seen.add(option);
			out.push(option);
		}
	}
	return out;
}

function outcome(question: string, options: string[], status: AskUserStatus, answer?: string): AskUserOutcome {
	const details: AskUserDetails = { question, options, status, ...(answer !== undefined ? { answer } : {}) };
	switch (status) {
		case "selected":
			return { text: `User selected: ${answer}`, details };
		case "custom":
			return { text: `User answered: ${answer}`, details };
		case "cancelled":
			return {
				text:
					"User cancelled the question without answering. Do not guess silently: " +
					"either stop and explain what you need, or continue with a clearly stated assumption.",
				details,
			};
		case "empty":
			return {
				text:
					"User submitted an empty answer. Treat this as no answer: " +
					"either ask again with clearer options, or continue with a clearly stated assumption.",
				details,
			};
	}
}

/**
 * Ask the user a question and normalise every possible response
 * (selection, custom text, cancel, empty) into one outcome.
 *
 * Throws {@link AskUserUnavailableError} when there is no interactive UI,
 * which Pi turns into a failed tool result the model can see.
 */
export async function askUser(
	ui: AskUI,
	hasUI: boolean,
	params: AskUserParams,
	signal?: AbortSignal,
): Promise<AskUserOutcome> {
	if (!hasUI) throw new AskUserUnavailableError();

	const question = params.question.trim();
	if (!question) throw new Error("ask_user requires a non-empty question.");

	const options = normalizeOptions(params.options);
	const allowCustom = params.allowCustom ?? true;
	const dialogOpts = signal ? { signal } : undefined;

	// Free-text only: no options given.
	if (options.length === 0) {
		const typed = await ui.input(question, params.placeholder, dialogOpts);
		return fromTyped(question, options, typed);
	}

	const menu = allowCustom ? [...options, CUSTOM_ANSWER_LABEL] : options;
	const choice = await ui.select(question, menu, dialogOpts);

	if (choice === undefined) return outcome(question, options, "cancelled");

	if (choice === CUSTOM_ANSWER_LABEL && allowCustom) {
		const typed = await ui.input(question, params.placeholder ?? "Type your answer…", dialogOpts);
		return fromTyped(question, options, typed);
	}

	// Defensive: only accept values that were actually offered.
	if (!options.includes(choice)) return outcome(question, options, "cancelled");
	return outcome(question, options, "selected", choice);
}

function fromTyped(question: string, options: string[], typed: string | undefined): AskUserOutcome {
	if (typed === undefined) return outcome(question, options, "cancelled");
	const answer = typed.trim();
	if (!answer) return outcome(question, options, "empty");
	return outcome(question, options, "custom", answer);
}
