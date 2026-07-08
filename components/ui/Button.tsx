import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost-icon' | 'ghost-link'
  active?: boolean
  children: ReactNode
}

const CLASS_BY_VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'nj-btn-primary',
  secondary: 'nj-btn-secondary',
  'ghost-icon': 'nj-btn-ghost-icon',
  'ghost-link': 'nj-btn-ghost-link',
}

export default function Button({
  variant = 'primary', active, className, children, ...rest
}: ButtonProps) {
  const classes = [CLASS_BY_VARIANT[variant], active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
