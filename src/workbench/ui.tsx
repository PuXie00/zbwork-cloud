import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export const fieldClass = 'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-800'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} min-h-28`} />
}

export function Button({ tone = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' }) {
  const toneClass = tone === 'primary'
    ? 'bg-stone-900 text-white hover:bg-stone-700'
    : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
  return (
    <button
      {...props}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${toneClass} ${className}`}
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-rose-700" role="alert">{children}</p>
}
