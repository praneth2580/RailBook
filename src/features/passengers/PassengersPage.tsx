import { useState } from 'react'
import { passengerCollection } from '../../core/collections'
import { useCollection } from '../../core/storage'
import type { Passenger } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { Avatar, EmptyState, PageHeader } from '../../ui/layout'
import { PassengerSheet, describePassenger } from './PassengerSheet'

export function PassengersPage() {
  const { items: passengers, loaded, save, remove } = useCollection(passengerCollection)
  const [editing, setEditing] = useState<Passenger | 'new' | null>(null)
  const close = () => setEditing(null)

  return (
    <>
      <PageHeader title="Passengers" subtitle="Your master list for every booking task" />

      {loaded && passengers.length === 0 ? (
        <EmptyState
          icon="users"
          title="No passengers yet"
          action={
            <button type="button" className="button" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              Add passenger
            </button>
          }
        >
          Save travellers once, then pick them for any booking task.
        </EmptyState>
      ) : (
        <ul className="list">
          {passengers.map((passenger) => (
            <li key={passenger.id}>
              <button type="button" className="list-row" onClick={() => setEditing(passenger)}>
                <Avatar id={passenger.id} name={passenger.name} />
                <span className="list-text">
                  <strong>{passenger.name}</strong>
                  <small>{describePassenger(passenger)}</small>
                </span>
                <Icon name="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {passengers.length > 0 && (
        <small className="muted center">
          {passengers.length} saved · A Tatkal ticket takes up to 4 passengers
        </small>
      )}

      <button type="button" className="fab" aria-label="Add passenger" onClick={() => setEditing('new')}>
        <Icon name="plus" size={24} />
      </button>

      <PassengerSheet
        open={editing !== null}
        passenger={editing === 'new' || editing === null ? undefined : editing}
        onClose={close}
        onSave={async (passenger) => {
          await save(passenger)
          close()
        }}
        onDelete={async (id) => {
          await remove(id)
          close()
        }}
      />
    </>
  )
}
