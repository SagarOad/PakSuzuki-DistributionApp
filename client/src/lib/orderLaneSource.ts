/** Normalize material source codes so Local / C.K.D. / In house aliases match. */
export function normalizeMaterialSource(v?: string | null): string {
  if (!v) return ''
  const compact = v.replace(/[.\s\-_]/g, '')
  const key = compact.toLowerCase()
  if (key === 'ckd') return 'C.K.D.'
  if (key === 'local' || key === 'loc') return 'Local'
  if (key === 'inhouse' || key === 'ih') return 'In house'
  return v.trim()
}

export function sameMaterialSource(a?: string | null, b?: string | null): boolean {
  const left = normalizeMaterialSource(a)
  const right = normalizeMaterialSource(b)
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

export function sourceScopeAllows(scope: string[] | undefined | null, sourceCode: string): boolean {
  if (!scope?.length) return true
  return scope.some((s) => sameMaterialSource(s, sourceCode))
}
