import type { Journey } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { ProgressBar, SectionHead } from '../../ui/layout'
import { readinessChecks } from './readiness'

export function toggleCheck(journey: Journey, id: string): Journey {
  const { confirmedChecks } = journey
  return {
    ...journey,
    confirmedChecks: confirmedChecks.includes(id)
      ? confirmedChecks.filter((other) => other !== id)
      : [...confirmedChecks, id],
  }
}

export function ReadinessList({
  journey,
  onChange,
  onlyOpen = false,
}: {
  journey: Journey
  onChange: (journey: Journey) => void
  /** Hide the checks that are already done. */
  onlyOpen?: boolean
}) {
  const checks = readinessChecks(journey).filter((check) => !onlyOpen || !check.done)

  return (
    <ul className="checklist">
      {checks.map((check) => (
        <li key={check.id}>
          <label className={check.done ? 'done' : undefined}>
            <input
              type="checkbox"
              checked={check.done}
              disabled={!check.manual}
              onChange={() => onChange(toggleCheck(journey, check.id))}
            />
            <span className="check-box">
              <Icon name="check" size={14} />
            </span>
            <span className="check-text">
              {check.label}
              {!check.manual && <small>Set from the task</small>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

export function ReadinessCard({ journey, onChange }: { journey: Journey; onChange: (journey: Journey) => void }) {
  const checks = readinessChecks(journey)
  const done = checks.filter((check) => check.done).length

  return (
    <section className="card">
      <SectionHead
        title="Readiness"
        action={
          <small className="muted">
            {done} of {checks.length}
          </small>
        }
      />
      <ProgressBar value={done / checks.length} label="Readiness" />
      <ReadinessList journey={journey} onChange={onChange} />
    </section>
  )
}
