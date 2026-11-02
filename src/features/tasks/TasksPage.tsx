import { useState } from 'react'
import { Link } from 'react-router-dom'
import { journeyCollection } from '../../core/collections'
import { useCollection } from '../../core/storage'
import { useNow } from '../../core/useNow'
import { Segmented } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/layout'
import { TaskCard } from './TaskCard'
import { byWindow, isActive, taskStatus, type TaskStatus } from './tasks'

const FILTERS = ['Active', 'Booked', 'Closed'] as const
type Filter = (typeof FILTERS)[number]

const FILTER_MATCHES: Record<Filter, (status: TaskStatus) => boolean> = {
  Active: isActive,
  Booked: (status) => status === 'booked',
  Closed: (status) => status === 'not-booked' || status === 'expired',
}

const EMPTY_MESSAGES: Record<Filter, { title: string; body: string }> = {
  Active: { title: 'No upcoming tasks', body: 'Create a booking task to start the countdown to its window.' },
  Booked: { title: 'Nothing booked yet', body: 'Tasks you finish with a PNR show up here.' },
  Closed: { title: 'No closed tasks', body: "Tasks that weren't booked, or whose date has passed, end up here." },
}

export function TasksPage() {
  const { items: journeys, loaded } = useCollection(journeyCollection)
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('Active')

  const count = (option: Filter) => journeys.filter((journey) => FILTER_MATCHES[option](taskStatus(journey, now))).length
  const shown = journeys
    .filter((journey) => FILTER_MATCHES[filter](taskStatus(journey, now)))
    .sort(filter === 'Active' ? byWindow : (a, b) => b.date.localeCompare(a.date))
  const empty = EMPTY_MESSAGES[filter]

  return (
    <>
      <PageHeader title="Booking tasks" subtitle="Every journey you're preparing to book" />
      <Segmented
        label="Show tasks"
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        format={(option) => `${option} ${count(option)}`}
      />

      {loaded && shown.length === 0 ? (
        <EmptyState
          icon="tasks"
          title={empty.title}
          action={
            filter === 'Active' && (
              <Link className="button" to="/tasks/new">
                <Icon name="plus" />
                New booking task
              </Link>
            )
          }
        >
          {empty.body}
        </EmptyState>
      ) : (
        <ul className="list">
          {shown.map((journey) => (
            <li key={journey.id}>
              <TaskCard journey={journey} now={now} />
            </li>
          ))}
        </ul>
      )}

      <Link className="fab" to="/tasks/new" aria-label="New booking task">
        <Icon name="plus" size={24} />
      </Link>
    </>
  )
}
