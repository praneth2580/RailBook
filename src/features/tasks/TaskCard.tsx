import { Link } from 'react-router-dom'
import { formatJourneyDate } from '../../core/format'
import type { Journey } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { formatCountdown, journeyOpensAt } from '../tatkal/tatkalWindow'
import { OutcomeLine, RouteLine, TaskStatusChip } from './TaskParts'
import { isActive, taskStatus } from './tasks'

export function TaskCard({ journey, now }: { journey: Journey; now: number }) {
  const status = taskStatus(journey, now)
  const passengers = journey.passengerIds.length

  return (
    <Link to={`/tasks/${journey.id}`} className="task-card">
      <div className="task-card-top">
        <RouteLine from={journey.from} to={journey.to} />
        <TaskStatusChip status={status} />
      </div>
      <div className="task-meta">
        <span>{journey.trainNumber}</span>
        <span>{journey.travelClass}</span>
        <span>{journey.quota ?? 'Tatkal'}</span>
        <span>
          {passengers} {passengers === 1 ? 'passenger' : 'passengers'}
        </span>
      </div>
      <div className="task-card-bottom">
        <span>
          <Icon name="calendar" size={16} />
          {formatJourneyDate(journey.date)}
        </span>
        {isActive(status) ? (
          <span className="countdown-mini">
            <Icon name="clock" size={16} />
            {formatCountdown(journeyOpensAt(journey).getTime() - now)}
          </span>
        ) : (
          <OutcomeLine journey={journey} />
        )}
      </div>
    </Link>
  )
}
