interface Props {
  history: number[]
}

export default function CrashHistory({ history }: Props) {
  if (history.length === 0) {
    return <div className="flex h-full" aria-hidden="true" />
  }
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-2 h-full">
      {history.slice(0, 12).map((m, i) => {
        const good = m >= 2
        return (
          <div
            key={i}
            className={`px-2 py-0.5 rounded-full font-semibold whitespace-nowrap leading-none ${
              good
                ? 'bg-green-600/80 text-white'
                : 'bg-red-600/80 text-white'
            }`}
            style={{ fontSize: 10 }}
          >
            ×{m.toFixed(2)}
          </div>
        )
      })}
    </div>
  )
}
