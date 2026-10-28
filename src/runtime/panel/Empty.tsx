export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-body text-faint">
      <strong className="text-base text-ink">{title}</strong>
      <span>{text}</span>
    </div>
  )
}
