/**
 * Campo de título reutilizável, com a regra global da aplicação:
 * - abre sempre vazio nos registos novos (nunca com texto de exemplo);
 * - sem placeholder que pareça conteúdo já preenchido;
 * - rótulo marcado como obrigatório ("Título *");
 * - ao tentar guardar sem título: bloqueia, destaca o campo, mostra
 *   "Introduza um título." e coloca o foco no campo.
 *
 * Qualquer formulário novo com título obrigatório deve usar useTitleField +
 * TitleField em vez de repetir a validação.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Mensagem única em PT-PT para título em falta. */
export const TITLE_REQUIRED_MESSAGE = "Introduza um título.";

export type TitleFieldState = {
  ref: RefObject<HTMLInputElement | null>;
  invalid: boolean;
  /** Valida; devolve false (e destaca/foca/avisa) quando está vazio. */
  validate: (onError?: (message: string) => void) => boolean;
  reset: () => void;
};

export function useTitleField(value: string, message = TITLE_REQUIRED_MESSAGE): TitleFieldState {
  const ref = useRef<HTMLInputElement | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (invalid && value.trim()) setInvalid(false);
  }, [value, invalid]);

  const validate = (onError?: (m: string) => void) => {
    if (value.trim()) {
      setInvalid(false);
      return true;
    }
    setInvalid(true);
    onError?.(message);
    toast.error(message);
    ref.current?.focus();
    return false;
  };

  return { ref, invalid, validate, reset: () => setInvalid(false) };
}

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  field: TitleFieldState;
  label?: string;
  disabled?: boolean;
  message?: string;
  /** Coloca o cursor no campo assim que este é montado (ex.: "Novo serviço"). */
  autoFocus?: boolean;
};

export function TitleField({
  id,
  value,
  onChange,
  field,
  label = "Título",
  disabled,
  message = TITLE_REQUIRED_MESSAGE,
  autoFocus = false,
}: Props) {
  const inputRef = field.ref;
  useEffect(() => {
    if (!autoFocus || disabled) return;
    // Espera que o modal termine a sua própria gestão de foco.
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [autoFocus, disabled, inputRef]);

  return (
    <>
      <Label htmlFor={id}>
        {label} <span aria-hidden="true"></span>
        <span className="sr-only">(obrigatório)</span>
      </Label>
      <Input
        id={id}
        ref={field.ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        disabled={disabled}
        aria-required="true"
        aria-invalid={field.invalid}
        aria-describedby={field.invalid ? `${id}-error` : undefined}
        className={field.invalid ? "border-destructive focus-visible:ring-destructive" : undefined}
      />
      {field.invalid && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
