import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import {
  formatCPF,
  onboardingConfirmInputSchema,
  type OnboardingConfirmInput,
} from '@effinance/shared';
import { formatDateTime } from '@/lib/datetime';
import { ApiRequestError } from '@/lib/api';

/** "Leitura confirmada em 18/11/2026 às 14:32". */
export function ConfirmedReading({ at }: { at: string }) {
  return (
    <p className="ob-done" role="status">
      <CircleCheck aria-hidden="true" />
      Leitura confirmada em {formatDateTime(at)}
    </p>
  );
}

interface ConfirmReadingFormProps {
  onConfirm: (input: OnboardingConfirmInput) => Promise<unknown>;
  pending?: boolean;
  /** The last error of the request (409 already confirmed, 429, 404). */
  error?: unknown;
}

/** Form options (also used by the test): the shared schema validates name and CPF before any request. */
export function confirmFormOptions() {
  return {
    resolver: zodResolver(onboardingConfirmInputSchema),
    defaultValues: { name: '', cpf: '' },
  };
}

/** "Confirmar leitura" of the public page: full name and CPF (masked while typing, validated before sending). */
export function ConfirmReadingForm({ onConfirm, pending, error }: ConfirmReadingFormProps) {
  const id = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingConfirmInput>(confirmFormOptions());
  const message =
    error instanceof ApiRequestError
      ? error.status === 429
        ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
        : error.message
      : error
        ? 'Não foi possível confirmar agora. Tente de novo.'
        : null;

  return (
    <form
      className="ob-noprint"
      noValidate
      onSubmit={handleSubmit((values) => onConfirm(values).catch(() => undefined))}
      aria-label="Confirmar leitura"
    >
      <div className="ob-form">
        <label htmlFor={`${id}-name`}>
          Nome completo
          <input
            id={`${id}-name`}
            className="ob-name"
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            {...register('name')}
          />
          {errors.name ? (
            <span id={`${id}-name-error`} className="ob-err">
              {errors.name.message}
            </span>
          ) : null}
        </label>
        <label htmlFor={`${id}-cpf`}>
          CPF
          <Controller
            control={control}
            name="cpf"
            render={({ field }) => (
              <input
                id={`${id}-cpf`}
                className="ob-cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-invalid={errors.cpf ? true : undefined}
                aria-describedby={errors.cpf ? `${id}-cpf-error` : undefined}
                value={field.value}
                onChange={(e) => field.onChange(formatCPF(e.target.value))}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          {errors.cpf ? (
            <span id={`${id}-cpf-error`} className="ob-err">
              {errors.cpf.message}
            </span>
          ) : null}
        </label>
        <button type="submit" className="ob-btn" disabled={pending}>
          {pending ? 'Confirmando…' : 'Confirmar leitura'}
        </button>
      </div>
      {message ? (
        <p className="ob-formerr" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
