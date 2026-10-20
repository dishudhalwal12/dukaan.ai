import assert from 'assert';
import { WALKTHROUGH_SIGNUP_CUTOFF, isSignupAfterCutoff } from '../src/utils/walkthroughGate.js';
import {
  TOUR_STEPS,
  TOUR_STEP_COUNT,
  demoStateForTourStep,
  tourStepForDemoState,
} from '../src/components/Walkthrough/tourSteps.js';

console.log('--- RUNNING WALKTHROUGH GATE TESTS ---');

// ── Signup cutoff ────────────────────────────────────────────────────────────
{
  const cutoff = WALKTHROUGH_SIGNUP_CUTOFF;
  const before = new Date(Date.parse(cutoff) - 1000).toISOString();
  const after = new Date(Date.parse(cutoff) + 1000).toISOString();

  assert.strictEqual(isSignupAfterCutoff(before), false, 'accounts before rollout are excluded');
  assert.strictEqual(isSignupAfterCutoff(cutoff), true, 'the cutoff instant itself is included');
  assert.strictEqual(isSignupAfterCutoff(after), true, 'accounts after rollout are eligible');
  console.log('✓ cutoff: before false, equal true, after true');
}

{
  for (const value of [null, undefined, '', 'not-a-date', 0]) {
    assert.strictEqual(isSignupAfterCutoff(value), false, `invalid signup value must fail closed: ${value}`);
  }
  assert.strictEqual(isSignupAfterCutoff(new Date().toISOString(), 'nope'), false, 'invalid cutoff fails closed');
  console.log('✓ missing and invalid timestamps fail closed');
}

// ── Seven steps and their demo states ───────────────────────────────────────
{
  assert.strictEqual(TOUR_STEP_COUNT, 7, 'the walkthrough exposes exactly seven steps');
  assert.deepStrictEqual(
    TOUR_STEPS.map((step) => step.key),
    ['dashboard', 'sales', 'orders_new', 'orders_pickup', 'orders_pay', 'catalog', 'profile']
  );

  for (const step of TOUR_STEPS) {
    assert.ok(step.element.startsWith('[data-tour='), `${step.key} has a data-tour target`);
    assert.ok(step.titleKey && step.descriptionKey, `${step.key} has localized copy`);
  }
  console.log('✓ seven steps with targets and copy keys');
}

{
  assert.strictEqual(demoStateForTourStep(0), 'new_order');
  assert.strictEqual(demoStateForTourStep(2), 'new_order');
  assert.strictEqual(demoStateForTourStep(3), 'order_details');
  assert.strictEqual(demoStateForTourStep(4), 'scan_to_pay');
  assert.strictEqual(demoStateForTourStep(5), 'completed');
  assert.strictEqual(demoStateForTourStep(6), 'completed');

  assert.strictEqual(tourStepForDemoState('new_order'), 2);
  assert.strictEqual(tourStepForDemoState('order_details'), 3);
  assert.strictEqual(tourStepForDemoState('scan_to_pay'), 4);
  assert.strictEqual(tourStepForDemoState('completed'), 5);
  assert.strictEqual(tourStepForDemoState('unknown'), null);
  console.log('✓ demo actions and tour steps map both ways');
}

console.log('\n========================================');
console.log('ALL WALKTHROUGH GATE TESTS PASSED');
console.log('========================================');
