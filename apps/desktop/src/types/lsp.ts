export type LspLanguage = 'typescript' | 'python' | 'json'

export interface LspNotification {
  language: LspLanguage
  method: string
  params: unknown
}
