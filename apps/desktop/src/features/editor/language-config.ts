const extensionToLanguage: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  py: 'python',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'shell',
  bash: 'shell',
  dockerfile: 'dockerfile',
}

export function languageForPath(path: string): string {
  const fileName = path.split(/[/\\]/).pop() ?? path
  if (fileName.toLowerCase() === 'dockerfile') return 'dockerfile'

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return extensionToLanguage[ext] ?? 'plaintext'
}
