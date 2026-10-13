import { describe, expect, it, vi } from "vitest";
import {
	AskUserUnavailableError,
	CUSTOM_ANSWER_LABEL,
	askUser,
	normalizeOptions,
	type AskUI,
} from "../src/ask-user.js";
import extension, { askUserTool } from "../src/index.js";

function fakeUI(overrides: Partial<AskUI> = {}): AskUI & { select: ReturnType<typeof vi.fn>; input: ReturnType<typeof vi.fn> } {
	return {
		select: vi.fn(async () => undefined),
		input: vi.fn(async () => undefined),
		...overrides,
	} as never;
}

const Q = "Which database should I use?";
const OPTS = ["SQLite", "Postgres"];

describe("selecting one of the provided options", () => {
	it("returns the chosen option", async () => {
		const ui = fakeUI({ select: vi.fn(async () => "Postgres") });
		const r = await askUser(ui, true, { question: Q, options: OPTS });
		expect(r.details).toMatchObject({ status: "selected", answer: "Postgres", question: Q });
		expect(r.text).toBe("User selected: Postgres");
		expect(ui.input).not.toHaveBeenCalled();
	});

	it("shows the options plus a custom-answer entry", async () => {
		const ui = fakeUI({ select: vi.fn(async () => "SQLite") });
		await askUser(ui, true, { question: Q, options: OPTS });
		expect(ui.select.mock.calls[0][0]).toBe(Q);
		expect(ui.select.mock.calls[0][1]).toEqual([...OPTS, CUSTOM_ANSWER_LABEL]);
	});

	it("omits the custom entry when allowCustom is false", async () => {
		const ui = fakeUI({ select: vi.fn(async () => "SQLite") });
		await askUser(ui, true, { question: Q, options: OPTS, allowCustom: false });
		expect(ui.select.mock.calls[0][1]).toEqual(OPTS);
	});

	it("trims and de-duplicates options", () => {
		expect(normalizeOptions([" A ", "A", "", "  ", "B"])).toEqual(["A", "B"]);
	});

	it("rejects a value that was never offered", async () => {
		const ui = fakeUI({ select: vi.fn(async () => "MongoDB") });
		const r = await askUser(ui, true, { question: Q, options: OPTS });
		expect(r.details.status).toBe("cancelled");
	});
});

describe("providing a custom answer", () => {
	it("prompts for text after choosing the custom entry", async () => {
		const ui = fakeUI({
			select: vi.fn(async () => CUSTOM_ANSWER_LABEL),
			input: vi.fn(async () => "  DuckDB  "),
		});
		const r = await askUser(ui, true, { question: Q, options: OPTS });
		expect(r.details).toMatchObject({ status: "custom", answer: "DuckDB" });
		expect(r.text).toBe("User answered: DuckDB");
	});

	it("asks free text directly when no options are given", async () => {
		const ui = fakeUI({ input: vi.fn(async () => "Use whatever is already in the repo") });
		const r = await askUser(ui, true, { question: "Any preference?" });
		expect(ui.select).not.toHaveBeenCalled();
		expect(r.details.status).toBe("custom");
		expect(r.details.answer).toBe("Use whatever is already in the repo");
	});
});

describe("cancellation or an empty response", () => {
	it("treats dismissing the selector as cancelled", async () => {
		const r = await askUser(fakeUI(), true, { question: Q, options: OPTS });
		expect(r.details.status).toBe("cancelled");
		expect(r.details.answer).toBeUndefined();
		expect(r.text).toMatch(/cancelled/i);
	});

	it("treats dismissing the custom text box as cancelled", async () => {
		const ui = fakeUI({ select: vi.fn(async () => CUSTOM_ANSWER_LABEL), input: vi.fn(async () => undefined) });
		const r = await askUser(ui, true, { question: Q, options: OPTS });
		expect(r.details.status).toBe("cancelled");
	});

	it("treats a whitespace-only custom answer as empty", async () => {
		const ui = fakeUI({ select: vi.fn(async () => CUSTOM_ANSWER_LABEL), input: vi.fn(async () => "   ") });
		const r = await askUser(ui, true, { question: Q, options: OPTS });
		expect(r.details.status).toBe("empty");
		expect(r.text).toMatch(/empty/i);
	});

	it("treats an empty free-text answer as empty", async () => {
		const ui = fakeUI({ input: vi.fn(async () => "") });
		const r = await askUser(ui, true, { question: "Preference?" });
		expect(r.details.status).toBe("empty");
	});

	it("rejects a blank question", async () => {
		await expect(askUser(fakeUI(), true, { question: "   " })).rejects.toThrow(/non-empty question/);
	});
});

describe("unavailable interactive UI", () => {
	it("throws without touching the UI", async () => {
		const ui = fakeUI();
		await expect(askUser(ui, false, { question: Q, options: OPTS })).rejects.toBeInstanceOf(AskUserUnavailableError);
		expect(ui.select).not.toHaveBeenCalled();
		expect(ui.input).not.toHaveBeenCalled();
	});

	it("tells the model not to retry", async () => {
		await expect(askUser(fakeUI(), false, { question: Q })).rejects.toThrow(/Do not retry/);
	});
});

describe("Pi integration", () => {
	it("registers an ask_user tool", () => {
		const registerTool = vi.fn();
		extension({ registerTool } as never);
		expect(registerTool).toHaveBeenCalledTimes(1);
		expect(registerTool.mock.calls[0][0].name).toBe("ask_user");
	});

	const run = (params: object, ctx: object) =>
		askUserTool.execute("call-1", params as never, undefined, undefined, ctx as never);

	it("returns the answer to the agent as tool content", async () => {
		const ctx = { hasUI: true, ui: fakeUI({ select: vi.fn(async () => "SQLite") }) };
		const result = await run({ question: Q, options: OPTS }, ctx);
		expect(result.content).toEqual([{ type: "text", text: "User selected: SQLite" }]);
		expect(result.details).toMatchObject({ status: "selected", answer: "SQLite" });
	});

	it("surfaces a failed tool result when there is no UI", async () => {
		const ctx = { hasUI: false, ui: fakeUI() };
		await expect(run({ question: Q }, ctx)).rejects.toThrow(/no interactive UI/);
	});

	it("forwards the abort signal to the dialog", async () => {
		const select = vi.fn(async (_t: string, _o: string[], _opts?: { signal?: AbortSignal }) => "SQLite" as string | undefined);
		const controller = new AbortController();
		await askUserTool.execute("c", { question: Q, options: OPTS } as never, controller.signal, undefined, {
			hasUI: true,
			ui: fakeUI({ select }),
		} as never);
		expect(select.mock.calls[0][2]).toEqual({ signal: controller.signal });
	});
});
