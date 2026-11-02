import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { passengerCollection } from '../../core/collections'
import { useCollection } from '../../core/storage'
import type { Passenger } from '../../core/types'
import { SearchField } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { Avatar, EmptyState, PageHeader, Panel } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { PassengerDialog } from './PassengerDialog'

export function PassengersPage() {
  const { items: passengers, loaded, save, remove } = useCollection(passengerCollection)
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState<Passenger | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const close = () => setEditing(null)

  // The command palette and the dashboard open a passenger, or a new one, through the location state.
  const requested = (location.state as { edit?: string } | null)?.edit
  useEffect(() => {
    if (!requested || !loaded) return
    setEditing(requested === 'new' ? 'new' : (passengers.find(({ id }) => id === requested) ?? null))
    navigate('.', { replace: true, state: null })
  }, [requested, loaded, passengers, navigate])

  const deletePassenger = async (passenger: Passenger) => {
    await remove(passenger.id)
    close()
    toast(`Deleted ${passenger.name}`, { label: 'Undo', run: () => void save(passenger) })
  }

  const shown = passengers
    .filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader
        title="Passengers"
        subtitle="Your master list. Pick from it in any booking task."
        actions={
          <button type="button" className="button" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} />
            Add passenger
          </button>
        }
      />

      {loaded && passengers.length === 0 ? (
        <EmptyState
          icon="users"
          title="No passengers yet"
          action={
            <button type="button" className="button" onClick={() => setEditing('new')}>
              <Icon name="plus" size={18} />
              Add passenger
            </button>
          }
        >
          Save travellers once, then pick them for any booking task.
        </EmptyState>
      ) : (
        <Panel className="table-panel">
          <div className="toolbar">
            <SearchField label="Search passengers" placeholder="Search by name" value={query} onChange={setQuery} />
            <small className="muted">{passengers.length} saved · Tatkal tickets take up to 4, General up to 6</small>
          </div>
          {shown.length === 0 ? (
            <p className="table-empty muted">No passengers match “{query}”.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="numeric">Age</th>
                  <th>Gender</th>
                  <th>Berth preference</th>
                  <th>Food</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((passenger) => (
                  <tr key={passenger.id} className="clickable" onClick={() => setEditing(passenger)}>
                    <td>
                      <span className="cell-person">
                        <Avatar id={passenger.id} name={passenger.name} size={28} />
                        <strong>{passenger.name}</strong>
                      </span>
                    </td>
                    <td className="numeric">{passenger.age}</td>
                    <td>{passenger.gender}</td>
                    <td>{passenger.berthPreference === 'None' ? 'Any' : passenger.berthPreference}</td>
                    <td>{passenger.foodChoice ?? 'No food'}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${passenger.name}`}
                        title="Edit"
                        onClick={(event) => {
                          event.stopPropagation()
                          setEditing(passenger)
                        }}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${passenger.name}`}
                        title="Delete"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deletePassenger(passenger)
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      <PassengerDialog
        open={editing !== null}
        passenger={editing === 'new' || editing === null ? undefined : editing}
        onClose={close}
        onSave={async (passenger) => {
          await save(passenger)
          close()
          toast(editing === 'new' ? `Added ${passenger.name}` : `Saved ${passenger.name}`)
        }}
        onDelete={deletePassenger}
      />
    </>
  )
}
