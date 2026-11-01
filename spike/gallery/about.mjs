// Longer copy and the "Adopt via Claude" prompt per workflow. Flows without an
// entry get a generic adopt prompt built from their name and address.
export const ABOUT = {
  dependabot: {
    article: { title: 'Letting agents auto-merge Dependabot pull requests', url: 'https://uberblick.ai/blog/2026/agents-auto-merge-dependabot' },
    runs: 'Uberblick, CampfireFM backend, CampfireFM Studio',
    why: [
      'Dependabot is good at noticing updates and bad at finishing them, so its pull requests pile up. Here its own `dependencies` label sends each one straight to the integrator, which works from the title and the diff and never reads the release notes in the body. Clean bumps merge, a failing test gets one fix round, and majors wait for a person.',
    ],
    gains: [
      'Security fixes land the day they are published, not when someone finds a quiet hour.',
      'Nobody reads release notes for a patch bump again.',
      'Majors still get a human eye, with every gate already green.',
    ],
    person: 'Major updates, and anything one fix round can\'t settle.',
    prompt: `I want to adopt the "Dependabot on autopilot" workflow from the ub-agents gallery.

Workflow: https://agents.uberblick.ai/workflows/dependabot/
Article: https://uberblick.ai/blog/2026/agents-auto-merge-dependabot
Docs: https://agents.uberblick.ai/docs/configuration/approvals.html#trusted-pr-authors

How it works: Dependabot labels its pull requests \`dependencies\`, and that label starts the integrator directly, with no issue and no preparation. Agents work from the title and the diff; the PR body (third-party release notes) is withheld. With every gate green, a patch or minor update merges. A failing test or a conflict gets one fix round from the implementer plus a review. A major update, or a second failure, goes to a person with needs-human.

Please:
1. Explain this flow in a few lines. If this session isn't inside the repository that runs ub-agents, ask me which one first.
2. Check my setup: the ub-agents version (needs 0.3.5 or later), ub-agents.yaml, .github/dependabot.yml and the loop policy under .agents/.
3. Propose the changes: \`trusted-pr-authors: [dependabot]\`, \`dependencies\` added to the integrator's trigger, and a "Dependabot pull requests" section in the shared loop policy (merge tiers, one fix round, majors to a person, never read the body).
4. Show me the diff before writing anything, and don't push.`,
  },
};

export const genericPrompt = (name, url) => `I want to adopt the "${name}" workflow from the ub-agents gallery.

Workflow: ${url}

Please:
1. Read the workflow page and explain the flow in a few lines. If this session isn't inside the repository that runs ub-agents, ask me which one first.
2. Compare it with my ub-agents.yaml and the loop policy under .agents/, and list what is missing.
3. Propose the smallest change that adopts it, show me the diff before writing anything, and don't push.`;
