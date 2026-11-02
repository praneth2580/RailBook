export const TRAVEL_CLASSES = ['2A', '3A', '3E', 'CC', 'EC', 'SL', '2S'] as const
export type TravelClass = (typeof TRAVEL_CLASSES)[number]

export const CLASS_NAMES: Record<TravelClass, string> = {
  '2A': 'AC 2 Tier',
  '3A': 'AC 3 Tier',
  '3E': 'AC 3 Economy',
  CC: 'AC Chair Car',
  EC: 'Exec. Chair Car',
  SL: 'Sleeper',
  '2S': 'Second Sitting',
}

export const QUOTAS = ['Tatkal', 'Premium Tatkal', 'General'] as const
export type Quota = (typeof QUOTAS)[number]

export const BERTH_PREFERENCES = ['None', 'Lower', 'Middle', 'Upper', 'Side lower', 'Side upper'] as const
export type BerthPreference = (typeof BERTH_PREFERENCES)[number]

export const GENDERS = ['Male', 'Female', 'Transgender'] as const
export type Gender = (typeof GENDERS)[number]

export const FOOD_CHOICES = ['No food', 'Veg', 'Non veg'] as const
export type FoodChoice = (typeof FOOD_CHOICES)[number]

export const PAYMENT_METHODS = ['UPI', 'Card', 'Net banking', 'IRCTC eWallet'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Passenger {
  id: string
  name: string
  age: number
  gender: Gender
  berthPreference: BerthPreference
  foodChoice?: FoodChoice
}

export interface BookingPreferences {
  autoUpgrade: boolean
  confirmedBerthsOnly: boolean
  travelInsurance: boolean
  /** Mobile number the ticket is sent to. */
  mobile: string
}

export type BookingOutcome =
  | { result: 'booked'; pnr: string; at: string; seconds: number }
  | { result: 'not-booked'; reason: string; at: string; seconds: number }

export interface Journey {
  id: string
  trainNumber: string
  backupTrainNumber: string
  travelClass: TravelClass
  /** YYYY-MM-DD departure date from the train's origin station, which sets the Tatkal window. */
  date: string
  from: string
  to: string
  boardingStation: string
  passengerIds: string[]
  /** Ids of the readiness checks the person has confirmed by hand. */
  confirmedChecks: string[]
  // Optional because journeys saved before booking tasks existed don't have them.
  quota?: Quota
  preferences?: BookingPreferences
  paymentMethod?: PaymentMethod
  outcome?: BookingOutcome
  createdAt?: string
}

export interface SavedPnr {
  id: string
  pnr: string
  note: string
  savedAt: string
}

export interface Train {
  number: string
  name: string
}

export type Theme = 'system' | 'light' | 'dark'

export interface Profile {
  name: string
  irctcUsername: string
  mobile: string
  email: string
}

export interface Settings {
  onboarded: boolean
  theme: Theme
  alertMinutes: number[]
  profile: Profile
  practiceBestSeconds: number | null
}
