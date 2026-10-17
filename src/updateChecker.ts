import packageJson from '../package.json'

const RELEASES_API = 'https://api.github.com/repos/LeonChrome/LEoKTV/releases?per_page=50'

export const APP_VERSION = packageJson.version

type ParsedVersion = {
  core: [number, number, number]
  prerelease: string[]
  display: string
}

export type ReleaseInfo = {
  version: string
  tagName: string
  title: string
  url: string
  prerelease: boolean
  publishedAt: string | null
}

export type UpdateCheckResult = {
  currentVersion: string
  latest: ReleaseInfo | null
  updateAvailable: boolean
  checkedAt: string
}

type GithubRelease = {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  prerelease?: unknown
  draft?: unknown
  published_at?: unknown
  created_at?: unknown
}

const parseVersion = (value: string): ParsedVersion | null => {
  const cleaned = value.trim().replace(/^v/i, '').split('+', 1)[0]
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  const prerelease = match[4] ? match[4].split('.') : []
  const display = `${Number(match[1])}.${Number(match[2])}.${Number(match[3] ?? 0)}${prerelease.length ? `-${prerelease.join('.')}` : ''}`
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)],
    prerelease,
    display,
  }
}

const compareIdentifiers = (left: string, right: string) => {
  const leftNumber = /^\d+$/.test(left)
  const rightNumber = /^\d+$/.test(right)
  if (leftNumber && rightNumber) return Number(left) - Number(right)
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1
  return left.localeCompare(right)
}

const compareVersions = (left: ParsedVersion, right: ParsedVersion) => {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0
  if (!left.prerelease.length) return 1
  if (!right.prerelease.length) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1
    if (right.prerelease[index] === undefined) return 1
    const compared = compareIdentifiers(left.prerelease[index], right.prerelease[index])
    if (compared !== 0) return compared
  }
  return 0
}

const releaseFromGithub = (release: GithubRelease): { info: ReleaseInfo; parsed: ParsedVersion } | null => {
  const tagName = typeof release.tag_name === 'string' ? release.tag_name.trim() : ''
  const parsed = parseVersion(tagName)
  const url = typeof release.html_url === 'string' ? release.html_url : ''
  if (!parsed || !tagName || !url) return null
  return {
    parsed,
    info: {
      version: parsed.display,
      tagName,
      title: typeof release.name === 'string' && release.name.trim() ? release.name.trim() : tagName,
      url,
      prerelease: Boolean(release.prerelease) || parsed.prerelease.length > 0,
      publishedAt: typeof release.published_at === 'string'
        ? release.published_at
        : typeof release.created_at === 'string'
          ? release.created_at
          : null,
    },
  }
}

export const checkForUpdates = async (signal?: AbortSignal): Promise<UpdateCheckResult> => {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`GitHub 更新检查失败（HTTP ${response.status}）`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('GitHub 返回的版本列表格式无效')

  const releases = payload
    .filter((item): item is GithubRelease => Boolean(item && typeof item === 'object'))
    .filter((release) => !release.draft)
    .map(releaseFromGithub)
    .filter((release): release is { info: ReleaseInfo; parsed: ParsedVersion } => Boolean(release))
    .sort((left, right) => {
      const byVersion = compareVersions(right.parsed, left.parsed)
      if (byVersion !== 0) return byVersion
      return (right.info.publishedAt ?? '').localeCompare(left.info.publishedAt ?? '')
    })

  const latest = releases[0]?.info ?? null
  const current = parseVersion(APP_VERSION)
  const updateAvailable = Boolean(latest && current && compareVersions(parseVersion(latest.version)!, current) > 0)
  return {
    currentVersion: current?.display ?? APP_VERSION,
    latest,
    updateAvailable,
    checkedAt: new Date().toISOString(),
  }
}
