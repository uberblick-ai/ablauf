// The diagram kinds, in display order. A new kind is one entry: it gets its
// own page at /<id>, a sidebar link and a line on the landing page. Every
// example's first line must be the kind's header.

export interface Example {
	/** A file in site/examples or spike/examples, without `.flow`. */
	name: string;
	title: string;
	/** One or two sentences under the title; may contain inline HTML. */
	note: string;
	/** Another example this one edits: its changed and added lines are marked. */
	editOf?: string;
}

export interface Kind {
	/** The kind's page: /<id>. */
	id: string;
	name: string;
	/** The source's first line, such as `flow v0`. */
	header: string;
	/** One sentence on what the kind is for. */
	summary: string;
	examples: readonly Example[];
}

export const kinds: readonly Kind[] = [
	{
		id: "flow",
		name: "Flow",
		header: "flow v0",
		summary:
			"Routed nodes and edges on a grid the author lays out: columns, rows and the sides each edge leaves and enters.",
		examples: [
			{
				name: "loop",
				title: "The ub-agents delivery loop",
				note: "The loop that runs on Uberblick's repositories: labels, agent roles, a rework column on the left and a person's decision on the right.",
			},
			{
				name: "loop-insert",
				title: "The same loop with a role inserted",
				note: "A security review after the reviewer. The marked lines are the whole edit: every other node keeps its column and row, and the rows below simply make room.",
				editOf: "loop",
			},
			{
				name: "checkout",
				title: "An online order",
				note: "<code>section</code> groups rows into bands, here checkout and fulfilment.",
			},
		],
	},
	{
		id: "fan-out",
		name: "Fan-out",
		header: "fan-out v0",
		summary:
			"One step and its ordered outcomes, each with a reason and a destination, for when why an outcome happens matters as much as where it goes.",
		examples: [
			{
				name: "approvals",
				title: "Whether approval permits a run",
				note: "Five lines of source, no edges and no placement to decide.",
			},
		],
	},
];
