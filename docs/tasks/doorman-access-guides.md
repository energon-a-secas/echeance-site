# Completed local task: access guides for Doorman build options

Status: implemented locally on 2026-09-20 following user approval of the Doorman refinement sequence. Not deployed.

## Implementation result

- Refreshed `gh-cli`, `wrangler-oauth` and `convex-cli`; retained their stable IDs.
- Added `supabase-access`, `stripe-sandbox`, `resend-sending`, `vercel-cli` and `netlify-cli` (28 tutorials total).
- Added optional access methods, environments, human/agent steps, permissions, variable classifications, troubleshooting, review date and status. Kept legacy string `verify` and older tutorials working.
- Updated rendering, search and the tutorial writer; validation scans optional fields and links without echoing suspect values. Invalid dates and links are rejected.
- Generated `llms.txt` and `data/tutorial-index.json` from the same public YAML source. Doorman uses stable direct links without a live API dependency.
- Verified the eight changed guides against the linked official documentation. Status is **docs-reviewed**, not tested against real accounts. No credentials, accounts or deployed resources were changed.
- Validation: four Python tests, deterministic generation, and browser checks for updated guides, an old guide, unknown IDs and malformed tutorial URLs. Browser tests used a synthetic empty inventory and blocked the private inventory route.

Next increment: provider-specific MCP methods only when an actual task needs them; extend review metadata to remaining older tutorials. Real account verification requires the relevant task/environment and is not claimed here.

The original brief follows for traceability; its proposed schema was simplified to the fields above.

Target repository: `echeance-site`.
Originating review: `../doorman-site/docs/REFINEMENT-REVIEW.md`.

## Objective

Make it straightforward for a person and an AI coding agent to establish the access required by a chosen Doorman build option, diagnose failures and revoke access when finished. Preserve Échéance's metadata-only credential inventory and its single tutorial source in `data/tutorials.yaml`.

Success means a Doorman candidate can link directly to an appropriate setup guide, and the guide explains the human step, agent step, minimum permissions, target environment and proof of access. MCP, CLI and API access are methods with different setup requirements; do not assume MCP is required or that a detected integration is already authenticated.

## Existing foundation

There are 23 tutorials in the current local checkout. Reuse existing IDs and improve their general applicability before creating overlapping material:

| Existing ID | Reuse for | Gap to investigate |
|---|---|---|
| `gh-cli` | Repository access and account switching | First-time setup, environment-token precedence, repo/org permissions, safe access probe |
| `github-ssh` | Git transport access | Keep separate from API/CLI identity and repository settings permissions |
| `wrangler-oauth` | Interactive Cloudflare access | Distinguish user login from scoped automation tokens and target account selection |
| `r2-cdn-token` | R2 publishing | Generalize fleet-specific steps; document scope/resource boundaries |
| `convex-cli` | Convex CLI sessions | First-time setup, dev/prod selection and deploy-key use in CI |
| `clerk-instance` | Clerk instance access | Public versus secret keys, matching environment, callback/domain setup |
| `airtable-pat` | Airtable access | Scope plus base access, runtime versus editor permissions, safe read validation |

Individual guides already use `https://echeance.neorgon.com/#tutorial/<id>`. `js/events.js` resolves these routes. Preserve old links. `scripts/build-llms.py` generates `llms.txt`; changes to source content must also regenerate that artifact.

## Work order

1. Audit the current access instructions against current official documentation. Record the source, date and actual validation status. Distinguish document review from a command executed against a disposable test project.
2. Improve GitHub, Cloudflare and Convex first, since they support the current low-cost Doorman paths. Separate generic public instructions from named fleet examples.
3. Add missing Supabase setup, Stripe sandbox access/webhook setup, and Resend sending/domain-verification guides for the corresponding Doorman selections.
4. Cover Vercel and Netlify CLI/account/environment configuration after the first group. Add provider-specific MCP instructions only after verifying the actual provider-supported endpoint, transport and permission model.
5. Add optional structured tutorial metadata with backward-compatible rendering and generator support.
6. Publish a small generated tutorial index for Doorman once the content contract is stable. Initially, direct links are sufficient; do not make Doorman's offline planning depend on a live fetch.

These are priorities, not a request to create every possible credential guide in one pass. Each guide should correspond to an actual selected capability or frequently encountered access failure.

## Guide contract

Keep existing `id`, `title`, `service`, `applies_to`, `signals`, `steps`, `verify`, `revoke`, `insights` and `links` working. Optional structured fields can include:

```yaml
intent: setup # setup | renew | troubleshoot
access_methods: [cli, api]
environments: [development, production]
prerequisites: []
human_steps: []
agent_steps: []
required_permissions: []
environment_variables: [] # names and public/server-only classification; no values
verification:
  mode: read-only
  command: "<documented command using environment variable names>"
  expected: "<non-secret evidence of account, resource and permission>"
troubleshooting: []
last_verified: null
verification_status: unverified # docs-reviewed | tested | unverified
```

The precise schema is to be implemented and validated here; these fields are not currently consumed by the app. Preserve legacy plain-string `verify` while migrating, and update `scripts/add-tutorial.py`, the renderer and the `llms.txt` generator together when adding fields.

Every guide should answer:

- What operation is the agent trying to perform, on which account/project/environment?
- Can an existing login be reused? Which step actually needs the human?
- Which credential type and permissions are required for that operation?
- Is a value public configuration or a server-only secret?
- Where does the runtime/CLI obtain it? Does setting it require restarting or redeploying?
- What is the smallest non-destructive access check, and what proves success?
- How do we distinguish identity, permissions, missing resource, expiry, quota, network and environment errors?
- How is access revoked or rotated without unnecessarily breaking other consumers?

Do not use token-length checks as authoritative authentication validation. They can detect some malformed values but formats change and a correctly shaped token can still be invalid. Do not print complete token values or require copying them into a model prompt. A successful identity probe alone is not proof of permission to access the intended repository, deployment or base.

## Documentation checked while preparing this brief

These official pages were opened during the Doorman review. Re-read them at implementation time; this list is not a claim that the existing tutorials have already been updated or tested.

- [GitHub CLI authentication status](https://cli.github.com/manual/gh_auth_status): starting point for account/session diagnostics.
- [Cloudflare API token creation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/): token permissions and resource restrictions are separate choices.
- [Convex CLI overview](https://docs.convex.dev/cli/overview): verify deployment targeting and deploy-key behavior before publishing commands.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): distinguish current publishable/secret keys from legacy keys; secret keys have elevated access and are not browser configuration.
- [Stripe API keys](https://docs.stripe.com/keys): distinguish restricted keys, test/live environments and separate webhook signing secrets.
- [Resend API key creation](https://resend.com/docs/api-reference/api-keys/create-api-key): source for operation-specific key configuration.
- [Netlify build environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/): source for environment delivery and build context.

## Acceptance criteria

- Existing tutorial deep links continue to work, including unknown-ID recovery.
- A user can enter from a Doorman service choice and find setup, verification and troubleshooting without searching all tutorials.
- Each changed guide names official source links, date and verification status.
- Instructions distinguish human login/approval steps from agent-executable steps.
- No credential values, account emails, private inventory metadata or real infrastructure identifiers enter published examples.
- Verification is read-only by default; any write probe clearly identifies its disposable test environment, cleanup and prerequisite authorization.
- Environment variables are classified correctly; browser-safe configuration is not confused with privileged server keys.
- `make llms` reproduces the generated file deterministically, and browser rendering and agent text retain the new content.
- Old tutorial entries still render when optional metadata is absent.
- The proposed index contains stable IDs and metadata only, with no dependency on the owner's private inventory.
- Doorman can use a cached link mapping without requiring cross-origin fetching to complete planning.

## Copyable execution brief

```text
Work in the echeance-site repository. Read CLAUDE.md and
docs/tasks/doorman-access-guides.md. Implement the first access-guide increment:
GitHub CLI, Cloudflare and Convex setup/verification/troubleshooting suitable
for a Doorman user who is giving a coding agent access to a selected stack.

Start by inspecting data/tutorials.yaml, js/tutorials.js, js/events.js,
scripts/add-tutorial.py and scripts/build-llms.py. Preserve existing IDs,
deep links and metadata-only storage. Verify current instructions against
official provider documentation before writing them.

Each guide must separate the human setup step from agent-executable steps,
name minimum permissions and the target environment, include a non-destructive
verification step, and diagnose likely failures before suggesting rotation.
Never use or publish the owner's real inventory or credential values.

Update the source YAML and regenerate llms.txt. Add backward-compatible
metadata/rendering only where needed for this increment. Validate YAML,
deep links, generated output and absence of secrets in examples.
This task edits documentation/application support; it does not authorize
creating accounts, minting credentials, changing live resources or deployment.
Report changed guides, sources, tests, unresolved access methods and the
next small increment. Update this task's status based on completed work.
```
