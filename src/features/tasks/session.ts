export type StepId = 'checks' | 'login' | 'window' | 'journey' | 'passengers' | 'payment' | 'pnr'

export interface SessionStep {
  id: StepId
  label: string
  hint: string
  /** RailBook completes its own steps. Everything on the official site is done by the person. */
  actor: 'app' | 'you'
  doneLabel: string
}

// Signing in comes before the wait, so the person is ready the moment the window opens.
export const SESSION_STEPS: SessionStep[] = [
  {
    id: 'checks',
    label: 'Pre-flight checks',
    hint: 'Passengers, backup train and account readiness',
    actor: 'app',
    doneLabel: 'Continue anyway',
  },
  {
    id: 'login',
    label: 'Sign in on IRCTC',
    hint: 'Sign in and solve the CAPTCHA on the official site',
    actor: 'you',
    doneLabel: "I'm signed in",
  },
  {
    id: 'window',
    label: 'Wait for the window',
    hint: 'Moves on by itself the moment booking opens',
    actor: 'app',
    doneLabel: 'Skip the wait',
  },
  {
    id: 'journey',
    label: 'Choose train and class',
    hint: 'Paste the stations and train number',
    actor: 'you',
    doneLabel: 'Train and class chosen',
  },
  {
    id: 'passengers',
    label: 'Fill passenger details',
    hint: 'Tap a value to copy it, then paste it',
    actor: 'you',
    doneLabel: 'Passengers filled',
  },
  {
    id: 'payment',
    label: 'Verify OTP and pay',
    hint: 'Complete the OTP and payment on the official site',
    actor: 'you',
    doneLabel: 'Payment done',
  },
  {
    id: 'pnr',
    label: 'Save your PNR',
    hint: 'Paste the booking SMS or the 10-digit PNR',
    actor: 'you',
    doneLabel: 'Save PNR',
  },
]

export const NOT_BOOKED_REASONS = [
  'Waitlisted',
  'Sold out',
  'Payment failed',
  'Site error',
  'Ran out of time',
  'Something else',
]
