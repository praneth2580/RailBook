/** An error the local API reports with its own status, such as 400 for a job that isn't valid. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
