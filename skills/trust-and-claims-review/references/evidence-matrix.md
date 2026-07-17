# Evidence Matrix

For each claim, record:

```text
claim:
claim type:
surface:
current/planned/target:
evidence owner:
evidence link:
source data or system:
methodology / verification method:
sample, date range, or measurement window:
scope:
limitations:
review required:
legal/security/privacy/data-lifecycle escalation:
discoverability handoff needed: yes/no
approved wording:
expiry/review date:
```

Use this file as the canonical evidence register for claims. If a discoverability review finds a page intended for citation but the source trail or support is missing, route the claim here instead of maintaining a separate discoverability evidence register.

## Minimum evidence by claim type

| Claim type                      | Minimum evidence                                                                         | Escalate to                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Statistical                     | Source data, methodology, sample/context, date range                                     | data-lifecycle-review when personal, analytics, or AI-derived data is involved |
| Comparative                     | Criteria, tested alternatives, method, date, scope                                       | compliance counsel for regulated comparisons                                   |
| Testimonial / social proof      | Verifiable identity, permission, date, allowed wording                                   | compliance counsel where endorsements are regulated                            |
| Security/privacy                | Technical controls, implementation owner, audit/certification where applicable           | security/privacy/data-lifecycle reviewers                                      |
| Performance/reliability         | Measurement method, conditions, date, variance, typical vs best case                     | technical owner                                                                |
| AI capability                   | What AI does, limits, evaluation method, failure modes                                   | data-lifecycle-review for prompts/outputs/training data                        |
| SEO/ranking/visibility/citation | Measurement source, query/surface scope, timeframe, role/position/click/conversion split | search/AI-surface monitoring structure                                         |

Claims should expire or be re-reviewed when implementation, data source, policy, product behaviour, or market context changes.
