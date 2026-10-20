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
	/** A sentence or two after the summary on the kind's page; may contain inline HTML. */
	intro?: string;
	examples: readonly Example[];
}

export const kinds: readonly Kind[] = [
	{
		id: "flow",
		name: "Flow",
		header: "flow v0",
		summary:
			"Routed nodes and edges on a grid the author lays out: columns, rows and the sides each edge leaves and enters.",
		intro: "The first four examples build one small flow, each adding a few options to the one before with the new and changed lines marked. Two complete flows follow.",
		examples: [
			{
				name: "steps",
				title: "Three nodes and two edges",
				note: 'Every line after the header is a node or an edge. A node is <code>kind id "text"</code>: a <code>pill</code> for a state, a <code>box</code> for a step, whose id is its title, and an <code>end</code> for the outcome. Each node starts a new row below the one before, and <code>a --> b</code> draws an arrow.',
			},
			{
				name: "branch",
				title: "A branch to the side",
				note: "<code>columns</code> names the columns from left to right, and <code>col=</code> puts a node in one; the nodes after it stay there. <code>row=agent</code> puts the new pill in the agent's row instead of a new one. Text after a colon labels an edge, and <code>tone=</code> colours a node or an edge.",
				editOf: "steps",
			},
			{
				name: "sides",
				title: "A way back",
				note: "<code>from=</code> and <code>to=</code> pick the sides an edge leaves and enters, so the return goes up and into the question's right side instead of across the box. <code>-.-></code> draws the edge dashed.",
				editOf: "branch",
			},
			{
				name: "person",
				title: "A person and a legend",
				note: "A third column on the left holds a <code>panel</code>: a box with indented lines, here a pill and a <code>muted</code> note. <code>tone=stop</code> marks where a person steps in, and <code>legend</code> explains the shapes under the diagram.",
				editOf: "sides",
			},
			{
				name: "checkout",
				title: "An online order",
				note: "<code>section</code> groups rows into bands, here checkout and fulfilment.",
			},
			{
				name: "loop",
				title: "The ub-agents delivery loop",
				note: "The loop that runs on Uberblick's repositories: labels, agent roles, a rework column on the left and a person's decision on the right.",
			},
			{
				name: "project-workflow",
				title: "A classic flowchart",
				note: "A project from concept to handover. <code>decision</code> draws a question over a small diamond, and <code>label=inline</code> sets each answer into a gap in its edge.",
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
