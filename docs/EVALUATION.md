# SIH Evaluation Guide

## Suggested reviewer flow

1. Open the landing page and review the stated problem and scope.
2. Enter the synthetic evaluation workspace.
3. Inspect institutional intake and enrolment records.
4. Run reconciliation and open a flagged case.
5. Review the rule/version and evidence behind the discrepancy.
6. Confirm that flags are presented as review candidates rather than proof of wrongdoing.
7. Check system health and integration configuration before relying on any external data.

## Evidence required before claiming readiness

- A successful clean production build
- Passing automated tests
- Screenshots of the running application using synthetic data
- Verified API and database workflows in the deployed environment
- Documented rule calculations and known limitations
- Confirmation that secrets and personal student information are not present in the repository

Do not claim that a workflow is live until it has been exercised end-to-end in the target environment.
