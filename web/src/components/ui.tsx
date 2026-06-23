import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

// Primitivas de UI mobile-first: targets táctiles grandes (min 44-52px), texto legible,
// foco visible (accesibilidad) y transiciones suaves (150-300ms).

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand hover:bg-brand-strong text-white',
  ghost: 'bg-surface-2 hover:bg-border text-fg',
  danger: 'bg-transparent hover:bg-danger/10 text-danger',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2
        rounded-xl px-5 text-base font-semibold transition-colors duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
        focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none
        ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

// Botón cuadrado para acciones con icono (editar/borrar). Requiere aria-label (a11y).
export function IconButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center
        rounded-xl bg-surface-2 text-muted transition-colors duration-200
        hover:bg-border hover:text-fg
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
        focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    />
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-[48px] w-full rounded-xl border border-border bg-surface px-4 text-base
        text-fg placeholder:text-muted outline-none transition-colors focus:border-brand
        ${className}`}
      {...props}
    />
  );
}

// Campo numérico grande con label arriba: pensado para cargar peso/reps/RIR de un toque
// en el celu (teclado numérico, texto centrado, números alineados con .tabular).
export function NumberField({
  label,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input
        inputMode="decimal"
        className={`tabular min-h-[52px] w-full rounded-xl border border-border bg-surface px-2
          text-center text-lg font-semibold text-fg placeholder:text-muted/50 outline-none
          transition-colors focus:border-brand ${className}`}
        {...props}
      />
    </label>
  );
}

// Select grande mobile-first con label arriba. Mismo lenguaje visual que TextInput.
export function Select({
  label,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      )}
      <select
        className={`min-h-[48px] w-full cursor-pointer rounded-xl border border-border bg-surface
          px-4 text-base text-fg outline-none transition-colors focus:border-brand ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

// Tarjeta: contenedor base con elevación sutil. Unifica el padding y el ritmo de toda la app.
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-5 shadow-card ${className}`}
      {...props}
    />
  );
}

// Etiqueta de sección (ÚLTIMA VEZ / HOY / NUEVA SERIE): da jerarquía sin gritar.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</p>
  );
}

// Pastilla para datos breves (objetivo del ejercicio): icono + texto sobre acento suave.
export function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1
        text-sm font-medium text-fg"
    >
      {icon}
      {children}
    </span>
  );
}

// Vista de estado uniforme (cargando / vacío / error). Mantiene consistente la UX.
export function StateView({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-lg font-semibold text-fg">{title}</p>
      {subtitle && <p className="max-w-xs text-sm leading-relaxed text-muted">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  );
}
