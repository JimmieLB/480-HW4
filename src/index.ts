import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { askUser, type AskUserDetails } from "./ask-user.js";

export const askUserTool = defineTool({
	name: "ask_user",
	label: "Ask User",
	description:
		"Ask the user a question and wait for their answer. Use this when a decision is genuinely " +
		"unresolved and the choice would change the outcome (e.g. which library, which of several " +
		"valid approaches, destructive-vs-safe). Provide 2-6 concise `options` when possible; the user " +
		"can also type a custom answer. Do not use it for questions you can answer by reading the code.",
	promptSnippet: "Ask the user to resolve an important unresolved choice",
	promptGuidelines: [
		"Use ask_user instead of guessing when a requirement is ambiguous and a wrong guess would be costly.",
		"Ask one focused question at a time, with short, mutually exclusive options.",
		"If ask_user reports a cancellation, an empty answer, or no UI, state your assumption explicitly or stop.",
	],
	parameters: Type.Object({
		question: Type.String({ description: "The question to show the user. Be specific and concise." }),
		options: Type.Optional(
			Type.Array(Type.String(), {
				description: "Suggested answers. Omit for a free-text question.",
			}),
		),
		allowCustom: Type.Optional(
			Type.Boolean({ description: "Let the user type their own answer when options are given. Default true." }),
		),
		placeholder: Type.Optional(Type.String({ description: "Placeholder for the free-text input." })),
	}),

	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const { text, details } = await askUser(ctx.ui, ctx.hasUI, params, signal);
		return {
			content: [{ type: "text", text }],
			details: details satisfies AskUserDetails,
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(askUserTool);
}
