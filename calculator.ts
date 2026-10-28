// Daily compound interest calculation engine.

export type RateFrequency = 'daily' | 'weekly' | 'monthly' | 'annually'
export type ContributionType = 'none' | 'deposits' | 'withdrawals'
export type ContributionFrequency = 'daily' | 'weekly' | 'monthly' | 'annually'
export type SummaryFrequency = 'daily' | 'weekly' | 'monthly' | 'annually'
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY'

export interface CalculatorInput {
  currency: CurrencyCode
  principal: number
  rate: number // % per period
  rateFrequency: RateFrequency
  years: number
  months: number
  days: number
  includeAllDays: boolean // true = every day; false = selected weekdays
  selectedDays: number[] // JavaScript weekday indices: Sunday=0 ... Saturday=6
  reinvestRate: number // % of interest reinvested (0–100)
  contributionType: ContributionType
  contributionAmount: number
  contributionFrequency: ContributionFrequency
  startDate: string // ISO yyyy-mm-dd
}

export interface DayRow {
  iso: string
  dayLabel: string
  dayOfWeek: string
  isCompoundingDay: boolean
  openingBalance: number
  interest: number
  reinvested: number
  withdrawnCash: number
  contribution: number // signed: + deposit, − withdrawal
  closingBalance: number
}

export interface SummaryRow {
  label: string
  date: string
  openingBalance: number
  interest: number
  reinvested: number
  withdrawnCash: number
  contributions: number
  closingBalance: number
}

export interface MonthlyRow {
  label: string
  openingBalance: number
  interest: number
  reinvested: number
  withdrawnCash: number
  contributions: number
  closingBalance: number
}

export interface CalcResult {
  days: DayRow[]
  monthly: MonthlyRow[]
  daily: SummaryRow[]
  weekly: SummaryRow[]
  annually: SummaryRow[]
  futureValue: number
  principal: number
  totalInterest: number
  interestReinvested: number
  cashWithdrawn: number
  totalDeposits: number
  totalWithdrawals: number
  totalContributions: number // signed net
  netProfit: number
  totalDays: number
  compoundingDays: number
  dailyRate: number // decimal (e.g. 0.004)
}

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
]

export const RATE_FREQUENCIES: { value: RateFrequency; label: string }[] = [
  { value: 'daily', label: 'daily' },
  { value: 'weekly', label: 'weekly' },
  { value: 'monthly', label: 'monthly' },
  { value: 'annually', label: 'annually' },
]

export const REINVEST_OPTIONS: number[] = Array.from({ length: 21 }, (_, i) => i * 5) // 0..100 step 5

const DAYS_PER_PERIOD: Record<RateFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  annually: 365,
}

export const MAX_TOTAL_DAYS = 36500 // ~100 years

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n))
  return new Date(y, (m || 1) - 1, d || 1)
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDisplay(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function totalDaysFromPeriod(years: number, months: number, days: number): number {
  return years * 365 + months * 30 + days
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '$'
}

/** Daily rate (decimal) derived from the entered periodic rate and its frequency. */
export function deriveDailyRate(rate: number, frequency: RateFrequency): number {
  return rate / 100 / DAYS_PER_PERIOD[frequency]
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function calculate(input: CalculatorInput): CalcResult {
  const principal = Math.max(0, Number(input.principal) || 0)
  const dailyRate = deriveDailyRate(Number(input.rate) || 0, input.rateFrequency)
  const reinvestPct = Math.min(100, Math.max(0, Number(input.reinvestRate) || 0))
  const totalDays = totalDaysFromPeriod(
    Math.max(0, Number(input.years) || 0),
    Math.max(0, Number(input.months) || 0),
    Math.max(0, Number(input.days) || 0),
  )
  const contributionAmount = Math.max(0, Number(input.contributionAmount) || 0)
  const isDeposit = input.contributionType === 'deposits'
  const isWithdrawal = input.contributionType === 'withdrawals'
  const hasContribution = (isDeposit || isWithdrawal) && contributionAmount > 0

  const start = parseISODate(input.startDate)

  let balance = principal
  let totalInterest = 0
  let interestReinvested = 0
  let cashWithdrawn = 0
  let totalDeposits = 0
  let totalWithdrawals = 0
  let compoundingDays = 0

  const days: DayRow[] = []
  const selectedDays = new Set(input.selectedDays ?? [1, 2, 3, 4, 5])

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const dow = date.getDay()
    const isCompoundingDay = input.includeAllDays || selectedDays.has(dow)
    const openingBalance = balance
    let interest = 0
    let reinvested = 0
    let withdrawnCash = 0

    if (isCompoundingDay) {
      compoundingDays++
      interest = balance * dailyRate
      reinvested = interest * (reinvestPct / 100)
      withdrawnCash = interest - reinvested
      balance += reinvested
      totalInterest += interest
      interestReinvested += reinvested
      cashWithdrawn += withdrawnCash
    }

    let contribution = 0
    if (hasContribution) {
      const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      const isLastDayOfMonth = nextDate.getMonth() !== date.getMonth()
      const isLastDayOfYear = nextDate.getFullYear() !== date.getFullYear()
      const isWeeklyDate = i % 7 === 6
      const applyNow = input.contributionFrequency === 'daily'
        || (input.contributionFrequency === 'weekly' && isWeeklyDate)
        || (input.contributionFrequency === 'monthly' && isLastDayOfMonth)
        || (input.contributionFrequency === 'annually' && isLastDayOfYear)
      if (applyNow) {
        if (isDeposit) { contribution = contributionAmount; totalDeposits += contributionAmount }
        else { contribution = -contributionAmount; totalWithdrawals += contributionAmount }
        balance += contribution
      }
    }
    days.push({ iso: formatISO(date), dayLabel: formatDisplay(date), dayOfWeek: DAY_NAMES[dow], isCompoundingDay, openingBalance, interest, reinvested, withdrawnCash, contribution, closingBalance: balance })
  }

  function summarize(keyFn: (row: DayRow, index: number) => { key: string; label: string; date: string }): SummaryRow[] {
    const rows: SummaryRow[] = []
    let currentKey = ''
    let current: SummaryRow | null = null
    days.forEach((row, index) => {
      const group = keyFn(row, index)
      if (group.key !== currentKey) {
        if (current) rows.push(current)
        current = { label: group.label, date: group.date, openingBalance: row.openingBalance, interest: 0, reinvested: 0, withdrawnCash: 0, contributions: 0, closingBalance: row.closingBalance }
        currentKey = group.key
      }
      if (current) {
        current.interest += row.interest
        current.reinvested += row.reinvested
        current.withdrawnCash += row.withdrawnCash
        current.contributions += row.contribution
        current.closingBalance = row.closingBalance
      }
    })
    if (current) rows.push(current)
    return rows
  }
  const daily = summarize((r) => ({ key: r.iso, label: `${r.dayLabel} (${r.dayOfWeek})`, date: r.iso }))
  const weekly = summarize((r, i) => {
    const week = Math.floor(i / 7)
    return { key: String(week), label: `Week ${week + 1} (${days[week * 7]?.iso} – ${r.iso})`, date: r.iso }
  })
  const monthlySummary = summarize((r) => {
    const d = parseISODate(r.iso)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`, date: r.iso }
  })
  const annually = summarize((r) => {
    const year = r.iso.slice(0, 4)
    return { key: year, label: year, date: r.iso }
  })
  const monthly: MonthlyRow[] = monthlySummary.map(({ label, openingBalance, interest, reinvested, withdrawnCash, contributions, closingBalance }) => ({ label, openingBalance, interest, reinvested, withdrawnCash, contributions, closingBalance }))

  const futureValue = balance
  const totalContributions = totalDeposits - totalWithdrawals
  const netProfit = futureValue - principal - totalContributions

  return {
    days,
    monthly,
    daily,
    weekly,
    annually,
    futureValue,
    principal,
    totalInterest,
    interestReinvested,
    cashWithdrawn,
    totalDeposits,
    totalWithdrawals,
    totalContributions,
    netProfit,
    totalDays,
    compoundingDays,
    dailyRate,
  }
}

export function formatMoney(value: number, currency: CurrencyCode): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currencySymbol(currency)}${value.toFixed(2)}`
  }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Build a full day-by-day CSV (summary header + schedule rows). */
export function buildCSV(result: CalcResult, input: CalculatorInput): string {
  const sym = currencySymbol(input.currency)
  const lines: string[] = []
  lines.push('Daily Compound Interest Schedule')
  lines.push(`Currency,${input.currency}`)
  lines.push(`Principal,${sym}${round2(result.principal)}`)
  lines.push(`Rate,${input.rate}% per ${input.rateFrequency}`)
  lines.push(`Period,${input.years} years, ${input.months} months, ${input.days} days (${result.totalDays} days)`)
  lines.push(`Start date,${input.startDate}`)
  lines.push(`Reinvest rate,${input.reinvestRate}%`)
  lines.push(
    `Contributions,${input.contributionType === 'none' ? 'none' : `${input.contributionType} ${sym}${round2(input.contributionAmount)} (${input.contributionFrequency})`}`,
  )
  lines.push(`Future value,${sym}${round2(result.futureValue)}`)
  lines.push(`Total interest earned,${sym}${round2(result.totalInterest)}`)
  lines.push(`Net profit,${sym}${round2(result.netProfit)}`)
  lines.push('')
  lines.push(
    [
      'Date',
      'Day',
      'Compounding day',
      'Opening balance',
      'Interest earned',
      'Reinvested',
      'Cash withdrawn',
      'Contribution',
      'Closing balance',
    ].map(csvEscape).join(','),
  )
  for (const row of result.days) {
    lines.push(
      [
        row.iso,
        row.dayOfWeek,
        row.isCompoundingDay ? 'Yes' : 'No',
        round2(row.openingBalance).toFixed(2),
        round2(row.interest).toFixed(2),
        round2(row.reinvested).toFixed(2),
        round2(row.withdrawnCash).toFixed(2),
        round2(row.contribution).toFixed(2),
        round2(row.closingBalance).toFixed(2),
      ].map(csvEscape).join(','),
    )
  }
  return lines.join('\n')
}

/** Export one selected summary granularity as a standalone CSV. */
export function buildSummaryCSV(result: CalcResult, input: CalculatorInput, frequency: SummaryFrequency): string {
  const rows: SummaryRow[] = frequency === 'daily' ? result.daily : frequency === 'weekly' ? result.weekly : frequency === 'monthly' ? result.monthly.map(r => ({ ...r, date: '' })) : result.annually
  const lines = [[`${frequency[0].toUpperCase()}${frequency.slice(1)} summary`], ['Period','Date','Opening balance','Interest earned','Reinvested','Interest withdrawn','Contributions','Closing balance'].map(csvEscape).join(',')]
  for (const r of rows) lines.push([r.label, r.date, round2(r.openingBalance).toFixed(2), round2(r.interest).toFixed(2), round2(r.reinvested).toFixed(2), round2(r.withdrawnCash).toFixed(2), round2(r.contributions).toFixed(2), round2(r.closingBalance).toFixed(2)].map(csvEscape).join(','))
  return lines.join('\n')
}

/** Sample the balance curve to at most `maxPoints` points for charting. */
export function sampleCurve(days: DayRow[], maxPoints: number): { index: number; iso: string; balance: number }[] {
  if (days.length <= maxPoints) {
    return days.map((d, index) => ({ index, iso: d.iso, balance: d.closingBalance }))
  }
  const step = (days.length - 1) / (maxPoints - 1)
  const out: { index: number; iso: string; balance: number }[] = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step)
    out.push({ index: idx, iso: days[idx].iso, balance: days[idx].closingBalance })
  }
  return out
}
