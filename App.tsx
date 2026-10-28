import { useMemo, useState, type ReactNode } from 'react'
import {
  Calendar,
  Calculator,
  Download,
  CircleHelp,
  TrendingUp,
  Wallet,
  PiggyBank,
  ArrowDownToLine,
  HandCoins,
} from 'lucide-react'
import {
  type CalculatorInput,
  type CalcResult,
  type CurrencyCode,
  type RateFrequency,
  type ContributionType,
  type ContributionFrequency,
  type SummaryFrequency,
  CURRENCIES,
  RATE_FREQUENCIES,
  REINVEST_OPTIONS,
  MAX_TOTAL_DAYS,
  currencySymbol,
  totalDaysFromPeriod,
  todayISO,
  formatMoney,
  formatNumber,
  calculate,
  buildCSV,
  buildSummaryCSV,
  sampleCurve,
} from './lib/calculator'

const REINVEST_HINT =
  'The share of each day\u2019s interest you keep compounding. At 100%, all interest stays invested. At 80%, 80% is reinvested and the remaining 20% is withdrawn as cash.'

function defaultForm() {
  return {
    currency: 'USD' as CurrencyCode,
    principal: '1000',
    rate: '0.4',
    rateFrequency: 'daily' as RateFrequency,
    years: '0',
    months: '0',
    days: '365',
    includeAllDays: true,
    selectedDays: [0, 1, 2, 3, 4, 5, 6],
    reinvestRate: 100,
    contributionType: 'none' as ContributionType,
    contributionAmount: '',
    contributionFrequency: 'monthly' as ContributionFrequency,
    startDate: todayISO(),
  }
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm text-slate-400">
      <span>{children}</span>
      {hint ? (
        <span className="group relative inline-flex">
          <CircleHelp className="size-4 text-slate-500 hover:text-slate-300" />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
            {hint}
          </span>
        </span>
      ) : null}
    </label>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; title?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 bg-[#0d1224] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value
              ? 'bg-orange-500 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function inputCls(extra = '') {
  return `w-full rounded-lg border border-slate-700 bg-[#0d1224] px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-orange-500/70 focus:ring-1 focus:ring-orange-500/40 ${extra}`
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min = '0',
  step,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: string
  step?: string
  className?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      min={min}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls(className)}
    />
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls('appearance-none pr-8')}>
      {children}
    </select>
  )
}

function Divider() {
  return <hr className="border-slate-800" />
}

export function Home() {
  const [f, setF] = useState(defaultForm())
  const [result, setResult] = useState<CalcResult | null>(null)
  const [lastInput, setLastInput] = useState<CalculatorInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summaryFrequency, setSummaryFrequency] = useState<SummaryFrequency>('monthly')

  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((p) => ({ ...p, [key]: value }))

  const totalDays = totalDaysFromPeriod(Number(f.years) || 0, Number(f.months) || 0, Number(f.days) || 0)

  function buildInput(): CalculatorInput | null {
    const principal = Number(f.principal)
    const rate = Number(f.rate)
    const years = Number(f.years) || 0
    const months = Number(f.months) || 0
    const days = Number(f.days) || 0
    const td = totalDaysFromPeriod(years, months, days)

    if (principal < 0) {
      setError('Principal amount cannot be negative.')
      return null
    }
    if (rate < 0) {
      setError('Interest rate cannot be negative.')
      return null
    }
    if (td < 1) {
      setError('Please enter a time period of at least 1 day.')
      return null
    }
    if (td > MAX_TOTAL_DAYS) {
      setError(`Time period is too long. Please keep it to ${MAX_TOTAL_DAYS} days or fewer.`)
      return null
    }
    if (!f.startDate) {
      setError('Please choose a start date.')
      return null
    }
    if (f.selectedDays.length === 0) {
      setError('Please select at least one weekday for compounding.')
      return null
    }
    const contributionAmount = Number(f.contributionAmount) || 0
    if (f.contributionType !== 'none' && contributionAmount < 0) {
      setError('Contribution amount cannot be negative.')
      return null
    }

    setError(null)
    return {
      currency: f.currency,
      principal,
      rate,
      rateFrequency: f.rateFrequency,
      years,
      months,
      days,
      includeAllDays: f.selectedDays.length === 7,
      selectedDays: f.selectedDays,
      reinvestRate: f.reinvestRate,
      contributionType: f.contributionType,
      contributionAmount,
      contributionFrequency: f.contributionFrequency,
      startDate: f.startDate,
    }
  }

  function onCalculate() {
    const input = buildInput()
    if (!input) {
      setResult(null)
      return
    }
    const res = calculate(input)
    setResult(res)
    setLastInput(input)
  }

  function downloadCSV() {
    if (!result || !lastInput) return
    const csv = buildCSV(result, lastInput)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compound-interest-${result.totalDays}d.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function downloadSummaryCSV() {
    if (!result || !lastInput) return
    const csv = buildSummaryCSV(result, lastInput, summaryFrequency)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compound-interest-${summaryFrequency}-summary.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const curve = useMemo(() => (result ? sampleCurve(result.days, 200) : []), [result])

  return (
    <div className="min-h-screen bg-[#080b16] text-slate-100">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500 text-white">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white sm:text-xl">Daily Compound Interest Calculator</h1>
              <p className="text-sm text-slate-400">Project the future value of an investment with daily compounding.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setF(defaultForm())
              setResult(null)
              setLastInput(null)
              setError(null)
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Use example
          </button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          {/* ─────────────────────────── Input panel ─────────────────────────── */}
          <section className="rounded-2xl border border-slate-800 bg-[#0f1424] p-5">
            <div className="mb-5">
              <FieldLabel>Currency</FieldLabel>
              <Segmented
                options={CURRENCIES.map((c) => ({ value: c.code, label: c.symbol, title: c.label }))}
                value={f.currency}
                onChange={(v) => set('currency', v)}
              />
            </div>

            <div className="mb-5">
              <FieldLabel>Principal amount</FieldLabel>
              <div className="flex">
                <span className="flex items-center rounded-l-lg border border-r-0 border-slate-700 bg-[#0a0f1e] px-3 text-sm text-slate-300">
                  {currencySymbol(f.currency)}
                </span>
                <NumberInput
                  value={f.principal}
                  onChange={(v) => set('principal', v)}
                  placeholder="0"
                  className="rounded-l-none"
                />
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Rate (%)</FieldLabel>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <NumberInput value={f.rate} onChange={(v) => set('rate', v)} placeholder="0" step="0.01" className="pr-8" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
                </div>
                <div className="relative w-32">
                  <Select value={f.rateFrequency} onChange={(v) => set('rateFrequency', v as RateFrequency)}>
                    {RATE_FREQUENCIES.map((r) => (
                      <option key={r.value} value={r.value} className="bg-[#0d1224]">
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">▾</span>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Time period</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <NumberInput value={f.years} onChange={(v) => set('years', v)} placeholder="0" min="0" />
                  <p className="mt-1 text-center text-xs text-slate-500">Years</p>
                </div>
                <div>
                  <NumberInput value={f.months} onChange={(v) => set('months', v)} placeholder="0" min="0" />
                  <p className="mt-1 text-center text-xs text-slate-500">Months</p>
                </div>
                <div>
                  <NumberInput value={f.days} onChange={(v) => set('days', v)} placeholder="0" min="0" />
                  <p className="mt-1 text-center text-xs text-slate-500">Days</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Total: {formatNumber(totalDays)} days</p>
            </div>

            <Divider />

            <div className="my-5">
              <FieldLabel>Compounding days</FieldLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Sunday',0],['Monday',1],['Tuesday',2],['Wednesday',3],['Thursday',4],['Friday',5],['Saturday',6]].map(([label, day]) => (
                  <label key={day} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#0d1224] px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" checked={f.selectedDays.includes(Number(day))} onChange={(e) => {
                      const selectedDays = e.target.checked ? [...f.selectedDays, Number(day)].filter((v, i, a) => a.indexOf(v) === i).sort((a,b) => a-b) : f.selectedDays.filter((v) => v !== Number(day))
                      setF((p) => ({ ...p, selectedDays, includeAllDays: selectedDays.length === 7 }))
                    }} className="accent-orange-500" />{label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Interest is applied only on selected weekdays. Select all seven days for daily compounding.</p>
            </div>

            <div className="mb-5">
              <FieldLabel hint={REINVEST_HINT}>Daily reinvest rate</FieldLabel>
              <div className="relative">
                <Select value={String(f.reinvestRate)} onChange={(v) => set('reinvestRate', Number(v))}>
                  {REINVEST_OPTIONS.map((r) => (
                    <option key={r} value={r} className="bg-[#0d1224]">
                      {r}%
                    </option>
                  ))}
                </Select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">▾</span>
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Additional contributions (optional)</FieldLabel>
              <Segmented
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'deposits', label: 'Deposits' },
                  { value: 'withdrawals', label: 'Withdrawals' },
                ]}
                value={f.contributionType}
                onChange={(v) => set('contributionType', v)}
              />
              {f.contributionType !== 'none' && (
                <div className="mt-3 flex gap-2">
                  <div className="flex flex-1">
                    <span className="flex items-center rounded-l-lg border border-r-0 border-slate-700 bg-[#0a0f1e] px-3 text-sm text-slate-300">
                      {currencySymbol(f.currency)}
                    </span>
                    <NumberInput
                      value={f.contributionAmount}
                      onChange={(v) => set('contributionAmount', v)}
                      placeholder="0"
                      className="rounded-l-none"
                    />
                  </div>
                  <div className="relative w-32">
                    <Select value={f.contributionFrequency} onChange={(v) => set('contributionFrequency', v as ContributionFrequency)}>
                      <option value="daily" className="bg-[#0d1224]">daily</option>
                      <option value="weekly" className="bg-[#0d1224]">weekly</option>
                      <option value="monthly" className="bg-[#0d1224]">monthly</option>
                      <option value="annually" className="bg-[#0d1224]">annually</option>
                    </Select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">▾</span>
                  </div>
                </div>
              )}
            </div>

            <Divider />

            <div className="my-5">
              <div className="mb-1.5 flex items-center gap-2">
                <label className="text-sm text-slate-400">Start date?</label>
                <button
                  type="button"
                  onClick={() => set('startDate', todayISO())}
                  className="text-xs text-orange-400 underline underline-offset-2 hover:text-orange-300"
                >
                  today
                </button>
              </div>
              <div className="relative">
                <input
                  type="date"
                  value={f.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  className={inputCls('pr-10')}
                />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            <button
              type="button"
              onClick={onCalculate}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-500"
            >
              <Calculator className="size-4" />
              Calculate
            </button>

            {error && (
              <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
          </section>

          {/* ─────────────────────────── Results panel ─────────────────────────── */}
          <section className="space-y-5">
            {!result ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0f1424] p-8 text-center">
                <Wallet className="mb-3 size-10 text-slate-700" />
                <p className="text-slate-300">Enter your investment details and press Calculate.</p>
                <p className="mt-1 text-sm text-slate-500">
                  Try the example: $1,000 at 0.4% daily for 365 days → $4,293.44.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <SummaryCard
                    icon={<TrendingUp className="size-4" />}
                    label="Future value"
                    value={formatMoney(result.futureValue, lastInput!.currency)}
                    accent
                  />
                  <SummaryCard
                    icon={<PiggyBank className="size-4" />}
                    label="Principal"
                    value={formatMoney(result.principal, lastInput!.currency)}
                  />
                  <SummaryCard
                    icon={<HandCoins className="size-4" />}
                    label="Total interest earned"
                    value={formatMoney(result.totalInterest, lastInput!.currency)}
                  />
                  <SummaryCard
                    icon={<Wallet className="size-4" />}
                    label="Net profit"
                    value={formatMoney(result.netProfit, lastInput!.currency)}
                    positive={result.netProfit >= 0}
                  />
                  {result.totalContributions !== 0 && (
                    <SummaryCard
                      icon={<ArrowDownToLine className="size-4" />}
                      label="Net contributions"
                      value={formatMoney(result.totalContributions, lastInput!.currency)}
                    />
                  )}
                  {result.cashWithdrawn > 0 && (
                    <SummaryCard
                      icon={<HandCoins className="size-4" />}
                      label="Interest withdrawn as cash"
                      value={formatMoney(result.cashWithdrawn, lastInput!.currency)}
                    />
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#0f1424] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Balance growth</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>
                        {formatNumber(result.totalDays)} days · {formatNumber(result.compoundingDays)} compounding
                      </span>
                      <button
                        type="button"
                        onClick={downloadCSV}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Download className="size-3.5" />
                        Full schedule CSV
                      </button>
                    </div>
                  </div>
                  <AreaChart points={curve} />
                </div>

                <BreakdownTable result={result} currency={lastInput!.currency} frequency={summaryFrequency} onFrequencyChange={setSummaryFrequency} onDownloadCSV={downloadSummaryCSV} />
              </>
            )}
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-600">
          Model assumptions: a year = 365 days and a month = 30 days for the entered duration. Weekly contributions recur every 7 days from the start of the schedule; monthly and annual contributions occur on the last calendar day of each month or year.
        </footer>
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
  positive,
}: {
  icon: ReactNode
  label: string
  value: string
  accent?: boolean
  positive?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f1424] p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <p
        className={`mt-2 truncate text-xl font-semibold ${
          accent ? 'text-orange-400' : positive === false ? 'text-red-400' : 'text-white'
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function AreaChart({ points }: { points: { index: number; iso: string; balance: number }[] }) {
  if (points.length < 2) return null
  const w = 760
  const h = 240
  const padX = 8
  const padY = 16
  const balances = points.map((p) => p.balance)
  const min = Math.min(...balances)
  const max = Math.max(...balances)
  const range = max - min || 1

  const x = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2)
  const y = (v: number) => h - padY - ((v - min) / range) * (h - padY * 2)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(h - padY).toFixed(1)} L${x(0).toFixed(1)},${(h - padY).toFixed(1)} Z`

  const gridLines = 4
  const grid = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = min + (range * i) / gridLines
    return { v, yv: y(v) }
  })

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[480px]">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padX} y1={g.yv} x2={w - padX} y2={g.yv} stroke="#1e2638" strokeWidth="1" />
            <text x={w - padX + 2} y={g.yv + 3} fontSize="10" fill="#64748b" textAnchor="start">
              {compact(g.v)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0].iso}</span>
        <span>{points[points.length - 1].iso}</span>
      </div>
    </div>
  )
}

function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k'
  return v.toFixed(v >= 100 ? 0 : 1)
}

function BreakdownTable({ result, currency, frequency, onFrequencyChange, onDownloadCSV }: { result: CalcResult; currency: CurrencyCode; frequency: SummaryFrequency; onFrequencyChange: (v: SummaryFrequency) => void; onDownloadCSV: () => void }) {
  const rows = frequency === 'daily' ? result.daily : frequency === 'weekly' ? result.weekly : frequency === 'monthly' ? result.monthly : result.annually
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f1424] p-4 sm:p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-white">Results summary</h2>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Summary period" value={frequency} onChange={(e) => onFrequencyChange(e.target.value as SummaryFrequency)} className={inputCls('w-auto min-w-28')}>
            <option value="daily">Daily / withdrawal date</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annually">Annually</option>
          </select>
          <button type="button" onClick={onDownloadCSV} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"><Download className="size-3.5" />Download summary CSV</button>
        </div>
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[650px] text-right text-xs">
          <thead className="sticky top-0 bg-[#141a2e] text-slate-400"><tr><th className="px-3 py-2 text-left font-medium">{frequency === 'daily' ? 'Date' : frequency === 'weekly' ? 'Week' : frequency === 'monthly' ? 'Month' : 'Year'}</th><th className="px-3 py-2">Opening</th><th className="px-3 py-2">Interest</th><th className="px-3 py-2">Reinvested</th><th className="px-3 py-2">Interest withdrawn</th><th className="px-3 py-2">Contributions</th><th className="px-3 py-2">Closing</th></tr></thead>
          <tbody className="text-slate-300">{rows.map((r, i) => <tr key={`${r.label}-${i}`}><td className="px-3 py-1.5 text-left font-medium text-slate-200">{r.label}</td><td className="px-3 py-1.5">{formatMoney(r.openingBalance, currency)}</td><td className="px-3 py-1.5 text-green-400">+{formatMoney(r.interest, currency)}</td><td className="px-3 py-1.5">{formatMoney(r.reinvested, currency)}</td><td className="px-3 py-1.5 text-slate-500">{formatMoney(r.withdrawnCash, currency)}</td><td className={`px-3 py-1.5 ${r.contributions !== 0 ? 'text-orange-400' : ''}`}>{r.contributions !== 0 ? (r.contributions > 0 ? '+' : '') + formatMoney(r.contributions, currency) : '—'}</td><td className="px-3 py-1.5 font-medium text-slate-100">{formatMoney(r.closingBalance, currency)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

export function App() {
  return <Home />
}
