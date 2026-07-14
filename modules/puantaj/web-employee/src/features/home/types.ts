import type { AttendanceActionResponse } from '../../types/api'

export interface LastAction {
  codeValue?: string
  response: AttendanceActionResponse
}

export type LastActionSummaryTone = 'neutral' | 'success' | 'warning'

export interface LastActionSummaryContent {
  title: string
  detail: string
  note: string
  tone: LastActionSummaryTone
}
