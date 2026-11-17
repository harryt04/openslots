/**
 * @openslots/react: BookingFlow, SlotPicker, ServiceList, hooks and a typed
 * client for the OpenSlots public API. See docs/TRD.md section 8.
 *
 * Import the styles once: `import '@openslots/react/styles.css'`.
 */
export { BookingFlow } from './components/booking-flow'
export type {
  BookedResult,
  BookingFlowProps,
  BookingStep,
} from './components/booking-flow'
export { SlotPicker } from './components/slot-picker'
export type { SelectedSlot, SlotPickerProps } from './components/slot-picker'
export { ServiceList } from './components/service-list'
export type { ServiceListProps } from './components/service-list'
export { ROOT_CLASS } from './components/root'
export type { Theme } from './components/root'

export { useBusiness, useSlots } from './hooks'
export type { Connection, RequestState, UseSlotsOptions } from './hooks'

export { createClient } from './client'
export type { ClientOptions, OpenSlotsClient, RequestOptions } from './client'
export { customerMessage, isOpenSlotsError, OpenSlotsError } from './errors'
export type { OpenSlotsErrorCode } from './errors'

export type {
  ApiErrorCode,
  BusinessResponse,
  CreateBookingBody,
  CreateBookingResponse,
  CustomerFields,
  ManageSummary,
  PublicService,
  RescheduleBody,
  ServiceColor,
  SlotsQuery,
  SlotsResponse,
} from '@openslots/core'
