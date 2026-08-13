export interface ModelInfo {
  id: string
  provider: string
  contextWindow: number
  /** Live, from `ProviderAvailabilityChecker`'s 60s background check (`GET /api/v1/models`) —
   *  not a static property of the model id. */
  available: boolean
}
