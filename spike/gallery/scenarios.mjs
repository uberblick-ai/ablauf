// Scenario tabs: each is a play section for the same diagram, so a tab lights a
// different path through one drawing. Flows not listed here play their own section.
export const SCENARIOS = {
  dependabot: [
    { name: 'Clean merge', play: `
  tempo 1.8s
  step dependabot       "Dependabot files | Bump vite from 7.1.2 to 7.1.5"
  step dependencies     "Loop picks | Trusted bot, fast path to the integrator"
  step integrator 2.6s  "Integrator | No conflicts, tests pass, no gate prevents merging"
  step merged 3s        "Merged | PR merged, no human bothered 🥳"` },
    { name: 'Tests failing', play: `
  tempo 1.8s
  step dependabot       "Dependabot files | Bump zod from 4.4.3 to 4.6.6"
  step dependencies     "Loop picks | Trusted bot, fast path to the integrator"
  step integrator 2.4s  "Integrator | A test fails on the new version, so it gets one fix round"
  step needs-changes    "Loop hands back | Labels it needs-changes"
  step implementer 2.8s "Implementer | Fixes two assertions; a reviewer checks the fix"
  step integrator 2.2s  "Integrator | Tests pass now, no gate prevents merging"
  step merged 3s        "Merged | PR merged after one fix round, still no human bothered 🛠️"` },
    { name: 'Fix fails', play: `
  tempo 1.8s
  step dependabot       "Dependabot files | Bump zod from 4.4.3 to 4.6.6"
  step dependencies     "Loop picks | Trusted bot, fast path to the integrator"
  step integrator 2.4s  "Integrator | A test fails on the new version, so it gets one fix round"
  step needs-changes    "Loop hands back | Labels it needs-changes"
  step implementer 2.6s "Implementer | Adapts the code; a reviewer checks the fix"
  step integrator 2.4s  "Integrator | Still failing after the one round, so no second try"
  step human 3s         "Needs a human | A person decides: fix by hand, pin the old version or close it"` },
    { name: 'Major release', play: `
  tempo 1.8s
  step dependabot       "Dependabot files | Bump a package to a new major version"
  step dependencies     "Loop picks | Trusted bot, fast path to the integrator"
  step integrator 2.6s  "Integrator | Tests pass, but a major can change behaviour"
  step human 3s         "Needs a human | A person reads the changelog and approves the merge"` },
  ],
  default: [
    { name: 'Clean run', play: `
  tempo 1.5s
  step start             "A maintainer adds the first label"
  step needs-preparation
  step issue-preparer    "Small and clear: scope and criteria written, marked ready"
  step ready
  step implementer 2.4s  "Changed 4 files, ran the tests, opened the PR"
  step needs-review
  step reviewer 2.2s     "Approved against the acceptance criteria"
  step ready-to-merge
  step integrator 2s     "Confirmed CI and the merge policy"
  step merged 3s         "Merged, issue closed"` },
    { name: 'Changes requested', play: `
  tempo 1.5s
  step start             "A maintainer adds the first label"
  step needs-preparation
  step issue-preparer    "Scope and criteria written, marked ready"
  step ready
  step implementer 2.4s  "Changed 7 files, ran 2,109 tests, opened the PR"
  step needs-review
  step reviewer 2.4s     "Changes requested: P1 in the parser"
  step needs-changes
  step implementer 2.4s  "Revised the same PR, fixed the P1"
  step needs-review
  step reviewer          "Approved"
  step ready-to-merge
  step integrator 2s     "Confirmed CI and the merge policy"
  step merged 3s         "Merged, issue closed"` },
    { name: 'Needs a person', play: `
  tempo 1.6s
  step start             "A maintainer adds the first label"
  step needs-preparation
  step issue-preparer 2.6s "Two ways to build it, and the choice is a product call"
  step human 3.2s        "needs-human: one question with options and a recommendation. Answer it, relabel, and the loop carries on"` },
  ],
  uberblick: [
    { name: 'Clean run', play: `
  tempo 1.6s
  step start               "A maintainer labels the issue needs-preparation"
  step needs-preparation
  step issue-preparer 2.6s "Read the product pages in the Uberblick workspace, wrote four acceptance criteria"
  step ready
  step implementer 2.6s    "Codex changed 6 files, ran the suite, opened the PR"
  step needs-review
  step pr-reviewer 2.4s    "Claude reviews Codex's work: approved"
  step ready-to-merge
  step integrator 2s       "Base updated, merge gate green"
  step merged 3s           "Merged, issue closed"` },
    { name: 'Second opinion', play: `
  tempo 1.6s
  step start               "A maintainer labels a larger issue"
  step needs-preparation
  step issue-preparer 2.6s "Read the product pages; the plan touches sync, so it asks for a second opinion"
  step issue-reviewer 2.6s "Codex reviews the plan: one criterion sharpened, approved"
  step ready
  step implementer 2.4s    "Codex builds it and opens the PR"
  step needs-review
  step pr-reviewer 2.4s    "Claude reviews: approved"
  step ready-to-merge
  step integrator 2s       "Merge gate green"
  step merged 3s           "Merged"` },
    { name: 'Changes requested', play: `
  tempo 1.6s
  step start               "A maintainer labels the issue"
  step needs-preparation
  step issue-preparer 2.2s "Scoped against the product pages"
  step ready
  step implementer 2.4s    "Codex opens the PR"
  step needs-review
  step pr-reviewer 2.6s    "Claude finds a P2: an edge case the product page names"
  step needs-changes
  step implementer 2.4s    "Codex fixes it on the same PR"
  step needs-review
  step pr-reviewer         "Approved"
  step ready-to-merge
  step integrator 2s       "Merge gate green"
  step merged 3s           "Merged"` },
  ],
  backend: [
    { name: 'Clean merge', play: `
  tempo 1.6s
  step start               "A maintainer labels a bug"
  step needs-preparation
  step issue-preparer 2.6s "Checked New Relic: the errors started with one endpoint. Scoped to it"
  step ready
  step implementer 2.4s    "Fixed it, ran the tests, opened the PR"
  step needs-review
  step reviewer 2.2s       "No findings: approved"
  step ready-to-merge
  step integrator 2.2s     "Gates green, nothing risky in the diff"
  step merged 3s           "Merged"` },
    { name: 'Schema change', play: `
  tempo 1.6s
  step start               "A maintainer labels a slow-endpoint issue"
  step needs-preparation
  step issue-preparer 2.8s "Checked New Relic: p95 up since Tuesday's deploy. Scoped the issue to one query"
  step ready
  step implementer 2.4s    "Added an index, ran the tests, opened the PR"
  step needs-review
  step reviewer 2.6s       "P1: the migration locks the table. Asked Copilot to look too"
  step needs-changes
  step implementer 2.2s    "Made the migration concurrent"
  step needs-review
  step reviewer            "Approved"
  step ready-to-merge
  step integrator 2.6s     "Gates green, Copilot's comments answered. It changes the schema, so a person merges"
  step maintainer 3s       "needs-maintainer-merge: one click for a person"` },
    { name: 'Needs a person', play: `
  tempo 1.6s
  step start               "A maintainer labels a feature request"
  step needs-preparation
  step issue-preparer 2.6s "The product corpus doesn't say how this should behave"
  step human 3s            "needs-human: one question, with options"` },
  ],
  studio: [
    { name: 'Milestone feature', play: `
  tempo 1.6s
  step start               "A maintainer labels a feature in the current milestone"
  step needs-preparation
  step issue-preparer 2.6s "Too big for one PR: split it into three sub-issues. This is the first"
  step issue-review
  step issue-reviewer 2s   "Approved the plan"
  step ready
  step implementer 2.4s    "Built it on the milestone branch. Slack: started"
  step pr-review
  step reviewer 2.6s       "Playwright green, checked the Vercel preview: approved"
  step ready-to-merge
  step integrator 2.2s     "Merged into the milestone branch. Slack: merged"
  step merged 3s           "The team merges the milestone into main when it is done"` },
    { name: 'Preview broken', play: `
  tempo 1.6s
  step start               "A maintainer labels a UI fix"
  step needs-preparation
  step issue-preparer 2.2s "Scoped the fix"
  step issue-review
  step issue-reviewer      "Approved"
  step ready
  step implementer 2.2s    "Fixed it, opened the PR"
  step pr-review
  step reviewer 2.6s       "The Vercel preview fails to build: changes requested. Slack: changes requested"
  step needs-changes
  step implementer 2.2s    "Fixed the build"
  step pr-review
  step reviewer            "Preview and Playwright green: approved"
  step ready-to-merge
  step integrator 2.2s     "Merged into the milestone branch"
  step merged 3s           "Done"` },
    { name: 'Risky change', play: `
  tempo 1.6s
  step start               "A maintainer labels an editor upgrade"
  step needs-preparation
  step issue-preparer 2.2s "Scoped the upgrade"
  step issue-review
  step issue-reviewer      "Approved"
  step ready
  step implementer 2.2s    "Upgraded the editor SDK, opened the PR"
  step pr-review
  step reviewer 2.2s       "Approved"
  step ready-to-merge
  step integrator 2.6s     "Gates green, but another service must move to the same version"
  step team 3s             "The Studio team merges it when the other side is ready"` },
  ],
};
