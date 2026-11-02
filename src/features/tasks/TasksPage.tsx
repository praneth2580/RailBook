import { useState } from 'react'
import { Link } from 'react-router-dom'
import { journeyCollection } from '../../core/collections'
import { useCollection } from '../../core/storage'
import type { Journey } from '../../core/types'
import { useNow } from '../../core/useNow'
import { SearchField, Segmented } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader, Panel } from '../../ui/layout'
import { TaskTable } from './TaskParts'
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

function matchesSearch(journey: Journey, query: string) {
  const text = [journey.from, journey.to, journey.boardingStation, journey.trainNumber, journey.backupTrainNumber]
    .join(' ')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

export function TasksPage() {
  const { items: journeys, loaded } = useCollection(journeyCollection)
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('Active')
  const [query, setQuery] = useState('')

  const count = (option: Filter) =>
    journeys.filter((journey) => FILTER_MATCHES[option](taskStatus(journey, now))).length
  const inFilter = journeys.filter((journey) => FILTER_MATCHES[filter](taskStatus(journey, now)))
  const shown = inFilter
    .filter((journey) => matchesSearch(journey, query.trim()))
    .sort(filter === 'Active' ? byWindow : (a, b) => b.date.localeCompare(a.date))
  const empty = EMPTY_MESSAGES[filter]

  return (
    <>
      <PageHeader
        title="Booking tasks"
        subtitle="Every journey you're preparing to book, soonest window first"
        actions={
          <Link className="button" to="/tasks/new" title="New booking task (N)">
            <Icon name="plus" size={18} />
            New task
          </Link>
        }
      />

      <Panel className="table-panel">
        <div className="toolbar">
          <Segmented
            label="Show tasks"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            format={(option) => `${option} · ${count(option)}`}
          />
          <SearchField label="Search tasks" placeholder="Search stations or trains" value={query} onChange={setQuery} />
        </div>

        {!loaded ? null : inFilter.length === 0 ? (
          <EmptyState
            icon="tasks"
            title={empty.title}
            action={
              filter === 'Active' && (
                <Link className="button" to="/tasks/new">
                  <Icon name="plus" size={18} />
                  New booking task
                </Link>
              )
            }
          >
            {empty.body}
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="table-empty muted">
            No {filter.toLowerCase()} tasks match “{query}”.
          </p>
        ) : (
          <TaskTable journeys={shown} now={now} />
        )}
      </Panel>
    </>
  )
}
