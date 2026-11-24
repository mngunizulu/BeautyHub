# Stage 3 browser acceptance

Run against a local, seeded BeautyHub stack with a Clerk development instance. Supply the matching keys through an ignored local `.env`; see [local Docker setup](DOCKER.md). Use a dedicated test organization and customer account. Publish one salon at a location with a free gallery slot. Leave that salon unsaved in the test customer account before starting.

Create two Playwright storage states by signing in through the real UI, one as the owner and one as the test customer. Store them under the ignored `.local/e2e` directory. The state files contain active sessions.

```powershell
New-Item -ItemType Directory -Force .local/e2e | Out-Null
pnpm exec playwright install chromium
pnpm exec playwright codegen --save-storage=.local/e2e/owner.json http://localhost:8080/sign-in
pnpm exec playwright codegen --save-storage=.local/e2e/customer.json http://localhost:8080/sign-in

$env:PLAYWRIGHT_BASE_URL = 'http://localhost:8080'
$env:BEAUTYHUB_E2E_OWNER_STATE = '.local/e2e/owner.json'
$env:BEAUTYHUB_E2E_CUSTOMER_STATE = '.local/e2e/customer.json'
$env:BEAUTYHUB_E2E_ORGANIZATION_ID = '<test organization UUID>'
$env:BEAUTYHUB_E2E_SALON_SLUG = '<published test salon slug>'
pnpm test:e2e --workers=1
```

Close each recorder after sign-in completes so it writes the state file. Keep the base URL identical between recording and test execution. Browser reports and traces can include sensitive test-session information. The signed-in scenario uses a synthetic image and deletes it afterward. It adds and removes the chosen salon from the test customer's favorites.

## Stage 4 booking acceptance

Use the same two Clerk browser states and organization settings. Configure the published test salon with both QA Treatment (55 EUR, 45 minutes) and QA Add-on (15 EUR, 15 minutes). Enable online booking for both and assign both services to the same active employee. Give the salon and employee working hours on the chosen date and pick a date within the salon's advance booking window with at least two free slots.

```powershell
$env:BEAUTYHUB_E2E_BOOKING_DATE = '<YYYY-MM-DD>'
pnpm exec playwright test booking.spec.ts --workers=1 --trace=off
```

The test creates or reuses the test customer's simulated payment reference, explicitly accepts the applicable policy, books both services and verifies the calendar, rescheduling and cancellation on both devices. It makes no real payment.

## Stage 5 operations acceptance

Use the Stage 4 owner state, published salon and available Monday. The owner journey creates a manual appointment, moves it using desktop drag-and-drop or the mobile Move button, adds a recurring break, creates a private customer profile, links the appointment and uploads an example PDF. Use a dedicated test tenant and an available 14:00–14:45 window for the test breaks.

```powershell
pnpm exec playwright test operations.spec.ts --workers=1 --trace=off
```

## Stage 8 review acceptance

Use the Stage 4 booking fixture and the isolated Compose project named `beautyhub-review-flow` on port 18083. Run the booking spec with the optional review steps enabled.

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:18083'
$env:BEAUTYHUB_E2E_REVIEW_FLOW = '1'
pnpm exec playwright test booking.spec.ts --workers=1 --trace=off
```

The test converts its own synthetic booking to a completed appointment in the isolated database. The customer then publishes the review in the browser, and the owner replies and reports it. The test temporarily enables the existing platform administrator flag for the fixture owner, verifies hiding and restoration in the browser, and resets the flag.

Set `BEAUTYHUB_E2E_LOYALTY=1` in addition to the review flag to exercise loyalty earning. The owner saves the award rate in Marketing, and the completion endpoint awards points after the fixture starts and ends in the past. The customer account must show the new balance.

Set `BEAUTYHUB_E2E_RETENTION=1` along with the review and loyalty flags to verify the points exchange, simulated package purchase, fixed-term membership enrollment, and gift-code issuance. Run desktop and mobile in separate invocations against isolated fixtures so the shared local IP stays within the API request limit.

Set `BEAUTYHUB_E2E_PLATFORM_BUSINESSES=1` with the review flag to exercise the platform business directory. The fixture administrator verifies the business, checks the public label, suspends the business, checks the public endpoint returns 404, then reactivates it and clears verification. Run the Chromium projects separately if the shared local IP reaches its API request limit.

Set `BEAUTYHUB_E2E_PLATFORM_CUSTOMERS=1` with the review flag to exercise deletion-request triage. The customer submits a request, the fixture administrator searches for the account, views the related records and acknowledges the request. The customer verifies the acknowledged request remains active, withdraws it and confirms it disappears from the active assessment workflow.

Set `BEAUTYHUB_E2E_SUPPORT=1` with the review flag to exercise support cases. The customer opens a private case. The fixture administrator replies and closes it. The customer can still read the reply, and the conversation shows its closed status.

Set `BEAUTYHUB_E2E_PLATFORM_OVERVIEW=1` with the review flag to verify the administrator dashboard and intake controls. The fixture administrator pauses support intake, verifies the customer cannot open a new case, and restores intake before the customer retries.
