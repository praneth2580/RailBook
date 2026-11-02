import { callApi } from './api'

export interface AppInfo {
  version: string
  dataDirectory: string
  /** The browser the window runs in. */
  browser: string
}

export function getAppInfo() {
  return callApi<AppInfo>('app-info', {})
}

export function openDataFolder() {
  return callApi('open-data-folder', {})
}
