/**
 * Shown on the Rule tab and on the Active rules tab. On the Rule tab it warns that the rule you are
 * about to save will not fire yet; on the Active rules tab it says why none of the listed rules do.
 */
export function PausedNote() {
  return (
    <p className="m-0 rounded-field border border-blue-line bg-blue-soft px-3 py-2 text-body">
      Rules are paused. Every request goes to the real server until you turn the “Mock rules” switch in the header back on.
    </p>
  )
}
