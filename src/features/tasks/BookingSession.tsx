import { useEffect, useState, type FormEvent } from 'react'
import { formatClock, formatDuration, formatElapsed, formatJourneyDate, formatPnr } from '../../core/format'
import { useSettings } from '../../core/settings'
import type { Journey, Passenger } from '../../core/types'
import { useNow } from '../../core/useNow'
import { openOfficialPage } from '../../platform/officialPages'
import { Icon } from '../../ui/Icon'
import { ConfirmSheet, Notice, Sheet } from '../../ui/layout'
import { extractPnr } from '../pnr/extractPnr'
import { CopyRow, JourneyCopyRows, PassengerCopyRows } from '../tatkal/CopyPanel'
import { ReadinessList } from '../tatkal/ReadinessCard'
import { readinessChecks } from '../tatkal/readiness'
import { formatCountdown, journeyOpensAt } from '../tatkal/tatkalWindow'
import { Facts, PAYMENT_DETAILS } from './TaskParts'
import { NOT_BOOKED_REASONS, SESSION_STEPS, type SessionStep } from './session'

interface Progress {
  startedAt: number
  stepIndex: number
  stepStartedAt: number
  /** Seconds each finished step took. */
  durations: number[]
}

interface LogEntry {
  at: number
  text: string
  tone?: 'success' | 'danger'
}

type SessionResult = { booked: true; pnr: string; seconds: number } | { booked: false; reason: string; seconds: number }

/**
 * A guided run through one booking. RailBook's own steps complete by themselves; the person does
 * every step on the official site and taps through as they finish it. Practice mode uses the same
 * screen without the app steps, and nothing it does is saved apart from the best time.
 */
export function BookingSession({
  journey,
  passengers,
  practice = false,
  onExit,
  onBooked,
  onNotBooked,
  onJourneyChange,
}: {
  journey: Journey
  passengers: Passenger[]
  practice?: boolean
  onExit: () => void
  onBooked?: (pnr: string, seconds: number) => Promise<void>
  onNotBooked?: (reason: string, seconds: number) => Promise<void>
  onJourneyChange?: (journey: Journey) => void
}) {
  const { settings, update } = useSettings()
  const steps = practice ? SESSION_STEPS.filter(({ actor }) => actor === 'you') : SESSION_STEPS
  const now = useNow()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [result, setResult] = useState<SessionResult | null>(null)
  const [previousBest, setPreviousBest] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [givingUp, setGivingUp] = useState(false)

  const step = progress ? steps[progress.stepIndex] : undefined
  const opensAt = journeyOpensAt(journey)
  const windowOpen = now >= opensAt.getTime()
  const ready = readinessChecks(journey).every(({ done }) => done)

  const addLog = (text: string, tone?: LogEntry['tone']) => setLog((entries) => [...entries, { at: Date.now(), text, tone }])
  const elapsedSeconds = () => (progress ? Math.round((Date.now() - progress.startedAt) / 1000) : 0)

  const start = () => {
    const at = Date.now()
    setProgress({ startedAt: at, stepIndex: 0, stepStartedAt: at, durations: [] })
    setLog([{ at, text: practice ? 'Practice started' : 'Session started' }])
    setResult(null)
  }

  const completeStep = () => {
    if (!progress || !step) return
    const at = Date.now()
    const seconds = Math.round((at - progress.stepStartedAt) / 1000)
    setProgress({
      ...progress,
      stepIndex: progress.stepIndex + 1,
      stepStartedAt: at,
      durations: [...progress.durations, seconds],
    })
    addLog(`${step.label} · ${formatDuration(seconds)}`)
  }

  // RailBook's own steps finish as soon as their condition holds, whenever a step starts or the condition changes.
  const autoComplete = (step?.id === 'checks' && ready) || (step?.id === 'window' && windowOpen)
  useEffect(() => {
    if (autoComplete) completeStep()
    // completeStep is rebuilt each render, so the effect keys on the values that decide whether it should run.
  }, [autoComplete, progress?.stepIndex])

  const finishBooked = async (pnr: string) => {
    const seconds = elapsedSeconds()
    if (practice) {
      setPreviousBest(settings.practiceBestSeconds)
      if (settings.practiceBestSeconds === null || seconds < settings.practiceBestSeconds) {
        await update({ practiceBestSeconds: seconds })
      }
    } else {
      await onBooked?.(pnr, seconds)
    }
    addLog(practice ? 'Practice finished' : `Booked · PNR ${formatPnr(pnr)}`, 'success')
    setResult({ booked: true, pnr, seconds })
  }

  const finishNotBooked = async (reason: string) => {
    const seconds = elapsedSeconds()
    await onNotBooked?.(reason, seconds)
    addLog(`Not booked · ${reason}`, 'danger')
    setGivingUp(false)
    setResult({ booked: false, reason, seconds })
  }

  return (
    <div className="session">
      <header className="session-header">
        <button
          type="button"
          className="icon-button"
          aria-label="Leave session"
          onClick={() => (progress && !result ? setLeaving(true) : onExit())}
        >
          <Icon name="close" />
        </button>
        <div className="page-title">
          <h1>{practice ? 'Practice run' : 'Booking session'}</h1>
          <small>
            {journey.from} to {journey.to} · {journey.trainNumber} · {journey.travelClass}
          </small>
        </div>
        <span className={`session-timer${progress && !result ? ' running' : ''}`} aria-label="Elapsed time">
          <Icon name="timer" size={16} />
          {formatElapsed(progress ? (result ? result.seconds * 1000 : now - progress.startedAt) : 0)}
        </span>
      </header>

      {!practice && (
        <div className={`window-strip${windowOpen ? ' open' : ''}`}>
          <span className="live-dot" />
          {windowOpen ? 'Booking window is open' : `Window opens in ${formatCountdown(opensAt.getTime() - now)}`}
        </div>
      )}

      {result ? (
        <ResultPanel
          result={result}
          practice={practice}
          previousBest={previousBest}
          onAgain={start}
          onExit={onExit}
        />
      ) : (
        <>
          <ol className="pipeline">
            {steps.map((item, index) => {
              const state = !progress
                ? 'pending'
                : index < progress.stepIndex
                  ? 'done'
                  : index === progress.stepIndex
                    ? 'current'
                    : 'pending'
              return (
                <li key={item.id} className={`pipeline-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="pipeline-marker">{state === 'done' ? <Icon name="check" size={14} /> : index + 1}</span>
                  <div className="pipeline-body">
                    <div className="pipeline-title">
                      <strong>{item.label}</strong>
                      <span className={`actor ${item.actor}`}>{item.actor === 'app' ? 'Auto' : 'You'}</span>
                      {state === 'done' && <small>{formatDuration(progress?.durations[index] ?? 0)}</small>}
                    </div>
                    {state === 'current' ? (
                      <StepPanel
                        step={item}
                        journey={journey}
                        passengers={passengers}
                        practice={practice}
                        username={settings.profile.irctcUsername}
                        countdown={formatCountdown(opensAt.getTime() - now)}
                        onDone={completeStep}
                        onBooked={finishBooked}
                        onJourneyChange={onJourneyChange}
                      />
                    ) : (
                      <small className="muted">{item.hint}</small>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {progress ? (
            !practice && (
              <button type="button" className="button ghost danger-text" onClick={() => setGivingUp(true)}>
                Couldn't book
              </button>
            )
          ) : (
            <div className="session-start">
              <button type="button" className="button large" onClick={start}>
                <Icon name="play" />
                {practice ? 'Start practice' : 'Start session'}
              </button>
              <small className="muted center">
                {practice
                  ? 'A rehearsal with sample details. Nothing here connects to IRCTC.'
                  : 'Start a few minutes early so you can sign in before the window opens.'}
              </small>
            </div>
          )}
        </>
      )}

      <section className="console" aria-label="Activity" aria-live="polite">
        <div className="console-head">
          <Icon name="terminal" size={16} />
          Activity
        </div>
        {log.length === 0 ? (
          <p className="console-idle">Waiting to start…</p>
        ) : (
          log.map((entry, index) => (
            <p key={index} className={entry.tone}>
              <time>{formatClock(entry.at)}</time>
              {entry.text}
            </p>
          ))
        )}
      </section>

      <ConfirmSheet
        open={leaving}
        title="Leave this session?"
        body="Your progress here will be lost. Anything you've done on the official site stays as it is."
        confirmLabel="Leave"
        onConfirm={onExit}
        onClose={() => setLeaving(false)}
      />
      <Sheet open={givingUp} title="What happened?" onClose={() => setGivingUp(false)}>
        <p className="muted">RailBook records the reason on the task. You can reopen it later.</p>
        <div className="reason-list">
          {NOT_BOOKED_REASONS.map((reason) => (
            <button key={reason} type="button" className="button secondary" onClick={() => finishNotBooked(reason)}>
              {reason}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function StepPanel({
  step,
  journey,
  passengers,
  practice,
  username,
  countdown,
  onDone,
  onBooked,
  onJourneyChange,
}: {
  step: SessionStep
  journey: Journey
  passengers: Passenger[]
  practice: boolean
  username: string
  countdown: string
  onDone: () => void
  /** Practice runs finish here too, without a PNR. */
  onBooked: (pnr: string) => void
  onJourneyChange?: (journey: Journey) => void
}) {
  const doneButton = (
    <button type="button" className="button" onClick={onDone}>
      <Icon name="check" />
      {step.doneLabel}
    </button>
  )

  switch (step.id) {
    case 'checks':
      return (
        <div className="step-panel">
          <small className="muted">Some checks are still open. Tick the ones you've confirmed.</small>
          {onJourneyChange && <ReadinessList journey={journey} onChange={onJourneyChange} onlyOpen />}
          <button type="button" className="button secondary" onClick={onDone}>
            {step.doneLabel}
          </button>
        </div>
      )
    case 'login':
      return (
        <div className="step-panel">
          {practice ? (
            <Notice>In a real session this opens the official IRCTC site. Sign in and solve the CAPTCHA there.</Notice>
          ) : (
            <button type="button" className="button secondary" onClick={() => openOfficialPage('booking')}>
              <Icon name="external" />
              Open IRCTC
            </button>
          )}
          {username && <CopyRow label="Username" value={username} />}
          {doneButton}
        </div>
      )
    case 'window':
      return (
        <div className="step-panel">
          <strong className="step-countdown">{countdown}</strong>
          <small className="muted">Have the search page ready. This step finishes itself when booking opens.</small>
          <button type="button" className="button ghost" onClick={onDone}>
            {step.doneLabel}
          </button>
        </div>
      )
    case 'journey':
      return (
        <div className="step-panel">
          <Facts
            items={[
              ['Date', formatJourneyDate(journey.date)],
              ['Class', journey.travelClass],
              ['Quota', journey.quota ?? 'Tatkal'],
            ]}
          />
          <JourneyCopyRows journey={journey} />
          {doneButton}
        </div>
      )
    case 'passengers':
      return (
        <div className="step-panel">
          <PassengerCopyRows passengers={passengers} />
          {journey.preferences?.mobile && <CopyRow label="Mobile" value={journey.preferences.mobile} />}
          {doneButton}
        </div>
      )
    case 'payment': {
      const method = journey.paymentMethod
      return (
        <div className="step-panel">
          {method && (
            <div className="card-row">
              <span className="option-icon">
                <Icon name={PAYMENT_DETAILS[method].icon} />
              </span>
              <span className="list-text">
                <strong>Pay with {method}</strong>
                <small>Enter the OTP and payment details on the official page</small>
              </span>
            </div>
          )}
          {doneButton}
        </div>
      )
    }
    case 'pnr':
      return practice ? (
        <div className="step-panel">
          <small className="muted">In a real session you'd paste the booking SMS here.</small>
          <button type="button" className="button" onClick={() => onBooked('')}>
            <Icon name="check" />
            Finish practice
          </button>
        </div>
      ) : (
        <PnrEntry label={step.doneLabel} onSave={onBooked} />
      )
  }
}

function PnrEntry({ label, onSave }: { label: string; onSave: (pnr: string) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const pnr = extractPnr(text)
    if (pnr) onSave(pnr)
    else setError('No PNR found. Paste the booking SMS or the 10-digit number.')
  }

  return (
    <form className="step-panel" onSubmit={submit}>
      <textarea
        required
        rows={3}
        aria-label="Booking SMS or PNR"
        placeholder="Paste the booking SMS or PNR"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <small className="error">{error}</small>}
      <button type="submit" className="button">
        <Icon name="ticket" />
        {label}
      </button>
    </form>
  )
}

function ResultPanel({
  result,
  practice,
  previousBest,
  onAgain,
  onExit,
}: {
  result: SessionResult
  practice: boolean
  previousBest: number | null
  onAgain: () => void
  onExit: () => void
}) {
  const newBest = practice && result.booked && (previousBest === null || result.seconds < previousBest)

  return (
    <section className="result">
      <span className={`result-icon ${result.booked ? 'success' : 'danger'}`}>
        <Icon name={result.booked ? 'checkCircle' : 'alert'} size={40} />
      </span>
      <h2>{practice ? 'Practice complete' : result.booked ? 'Ticket booked' : 'Not booked this time'}</h2>
      <p className="muted">
        {result.booked ? `Finished in ${formatDuration(result.seconds)}` : `${result.reason} after ${formatDuration(result.seconds)}`}
      </p>
      {newBest && <span className="status-chip success">New best time</span>}
      {practice && !newBest && previousBest !== null && (
        <small className="muted">Your best is {formatDuration(previousBest)}</small>
      )}
      {result.booked && !practice && (
        <div className="result-pnr">
          <small>PNR</small>
          <strong>{formatPnr(result.pnr)}</strong>
          <small>Saved to your PNR list</small>
        </div>
      )}
      <div className="button-row">
        {practice && (
          <button type="button" className="button secondary" onClick={onAgain}>
            <Icon name="refresh" />
            Go again
          </button>
        )}
        <button type="button" className="button" onClick={onExit}>
          {practice ? 'Done' : 'Back to task'}
        </button>
      </div>
    </section>
  )
}
